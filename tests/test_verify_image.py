import importlib.util
import json
import pathlib
import unittest
from unittest import mock

import torch


MODULE_PATH = pathlib.Path(__file__).parents[1] / "nodes" / "verify_image.py"
SPEC = importlib.util.spec_from_file_location("copysight_verify_tests", MODULE_PATH)
copysight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(copysight)


VALID_FINDING = {
    "name": "Example Character",
    "category": "Characters",
    "author": "Example Author",
    "owner": "Example Owner",
    "bounding_box": {"x": 0.2, "y": 0.2, "width": 0.4, "height": 0.5},
    "similarity": 0.92,
}


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self.payload = payload

    def json(self):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class ImageTests(unittest.TestCase):
    def test_single_image_is_encoded_as_rgb_png(self):
        image = torch.zeros((1, 16, 24, 3), dtype=torch.float32)
        encoded = copysight._encode_png(copysight._image_to_pil(image))
        self.assertTrue(encoded.startswith(b"\x89PNG\r\n\x1a\n"))

    def test_image_batches_are_rejected_before_upload(self):
        with self.assertRaisesRegex(ValueError, "accepts one image"):
            copysight._image_to_pil(torch.zeros((2, 16, 16, 3)))

    def test_annotations_use_distinct_colors_and_top_left_box_coordinates(self):
        source = copysight.Image.new("RGB", (100, 100), "black")
        second_finding = {
            **VALID_FINDING,
            "name": "Example Brand",
            "bounding_box": {"x": 0.65, "y": 0.1, "width": 0.2, "height": 0.2},
        }
        annotated = copysight._annotate_image(source, [VALID_FINDING, second_finding])
        colors = [copysight._finding_color(index) for index in range(2)]
        expected = [
            torch.tensor([int(color[offset:offset + 2], 16) for offset in (1, 3, 5)], dtype=torch.float32) / 255
            for color in colors
        ]
        self.assertNotEqual(colors[0], colors[1])
        self.assertTrue(torch.allclose(annotated[0, 20, 20], expected[0]))
        self.assertTrue(torch.allclose(annotated[0, 10, 65], expected[1]))
        self.assertTrue(torch.equal(annotated[0, 80, 80], torch.zeros(3)))


class ResponseTests(unittest.TestCase):
    def test_response_is_normalized_at_the_api_boundary(self):
        finding = dict(VALID_FINDING, similarity="0.92", author=None)
        report = copysight._normalize_response({"contains_face": True, "detected_ips": [finding]})
        self.assertTrue(report["contains_face"])
        self.assertEqual(report["detected_ips"][0]["similarity"], 0.92)
        self.assertEqual(report["detected_ips"][0]["author"], "")

    def test_out_of_bounds_box_is_rejected(self):
        finding = dict(VALID_FINDING)
        finding["bounding_box"] = {"x": 0.8, "y": 0.2, "width": 0.4, "height": 0.5}
        with self.assertRaisesRegex(copysight.CopySightError, "outside the image"):
            copysight._normalize_response({"contains_face": False, "detected_ips": [finding]})

    def test_invalid_json_is_rejected(self):
        with mock.patch.object(copysight.requests, "post", return_value=FakeResponse(payload=ValueError("bad json"))):
            with self.assertRaisesRegex(copysight.CopySightError, "invalid JSON"):
                copysight._verify_image(b"png", "secret")


class RequestTests(unittest.TestCase):
    def test_verify_posts_expected_header_and_multipart_file(self):
        payload = {"contains_face": False, "detected_ips": [VALID_FINDING]}
        with mock.patch.object(copysight.requests, "post", return_value=FakeResponse(payload=payload)) as post:
            report = copysight._verify_image(b"png-data", "secret-key")

        self.assertEqual(report["detected_ips"][0]["name"], "Example Character")
        args, kwargs = post.call_args
        self.assertEqual(args, (copysight.VERIFY_URL,))
        self.assertEqual(kwargs["headers"], {"X-API-Key": "secret-key"})
        self.assertEqual(kwargs["files"]["file"], ("copysight.png", b"png-data", "image/png"))
        self.assertEqual(kwargs["timeout"], copysight.REQUEST_TIMEOUT)

    def test_rate_limit_includes_retry_after(self):
        response = FakeResponse(429, {"error": "Too Many Requests", "retry_after": 60})
        with mock.patch.object(copysight.requests, "post", return_value=response):
            with self.assertRaisesRegex(copysight.CopySightError, "Retry after 60 seconds"):
                copysight._verify_image(b"png", "secret")

    def test_api_key_is_redacted_from_errors(self):
        self.assertEqual(
            copysight._safe_error(ValueError("invalid secret-key value"), "secret-key"),
            "invalid *** value",
        )

    def test_execute_returns_owned_outputs_and_ui_payload(self):
        report = {"contains_face": False, "detected_ips": [VALID_FINDING]}
        events = []
        image = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
        with (
            mock.patch.object(copysight, "_verify_image", return_value=report) as verify,
            mock.patch.object(copysight, "_save_preview", return_value={"filename": "result.png", "subfolder": "", "type": "temp"}),
            mock.patch.object(copysight, "_emit", side_effect=lambda node, phase, message: events.append((phase, message))),
        ):
            output = copysight.CopySightVerifyImage.execute(image=image, api_key="secret-key")

        verify.assert_called_once()
        self.assertEqual(len(output.result), 2)
        self.assertEqual(json.loads(output.result[1]), report)
        self.assertEqual(output.ui["copysight"][0]["finding_count"], 1)
        self.assertEqual(
            output.ui["copysight"][0]["findings"][0]["display_color"],
            copysight._finding_color(0),
        )
        self.assertNotIn("display_color", json.loads(output.result[1])["detected_ips"][0])
        self.assertNotIn("secret-key", repr(output.ui))
        self.assertEqual([phase for phase, _ in events], ["preparing", "checking", "rendering", "complete"])


class NodeContractTests(unittest.TestCase):
    def test_schema_uses_standalone_copysight_identity(self):
        schema = copysight.CopySightVerifyImage.GET_SCHEMA()
        self.assertEqual(schema.node_id, "CopySightVerifyImage")
        self.assertEqual(schema.category, "CopySight")
        self.assertEqual(copysight.CopySightVerifyImage.RETURN_TYPES, ["IMAGE", "STRING"])
        self.assertNotIn("FL", schema.node_id)


if __name__ == "__main__":
    unittest.main()
