import colorsys
import json
import logging
import math
import os
from io import BytesIO

import numpy as np
import requests
import torch
from PIL import Image, ImageDraw

from comfy_api.latest import io
from nodes import PreviewImage
from server import PromptServer


logger = logging.getLogger("comfyui_copysight")

VERIFY_URL = "https://api.copysight.ai/v1/verify"
EVENT_NAME = "copysight_progress"
REQUEST_TIMEOUT = (10, 120)
COLOR_HUE_STEP = 0.61803398875


class CopySightError(RuntimeError):
    pass


def _emit(node_id, phase, message):
    if PromptServer.instance is None:
        return
    try:
        PromptServer.instance.send_sync(
            EVENT_NAME,
            {"node": str(node_id), "phase": phase, "message": message},
        )
    except Exception:
        logger.debug("Unable to send CopySight UI event.", exc_info=True)


def _safe_error(error, api_key):
    message = str(error).strip() or error.__class__.__name__
    if api_key:
        message = message.replace(api_key, "***")
    return message


def _image_to_pil(image):
    if not isinstance(image, torch.Tensor) or image.ndim != 4:
        raise ValueError("CopySight requires a ComfyUI IMAGE tensor.")
    if image.shape[0] != 1:
        raise ValueError("CopySight Verify Image accepts one image. Split image batches before this node.")
    if image.shape[-1] < 3:
        raise ValueError("CopySight requires an RGB image.")

    pixels = image[0, ..., :3].detach().to(device="cpu", dtype=torch.float32)
    pixels = pixels.clamp(0, 1).mul(255).round().to(torch.uint8).numpy()
    return Image.fromarray(pixels)


def _encode_png(image):
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _number(value, field):
    if isinstance(value, bool):
        raise CopySightError(f"CopySight returned an invalid {field}.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise CopySightError(f"CopySight returned an invalid {field}.") from None
    if not math.isfinite(number):
        raise CopySightError(f"CopySight returned an invalid {field}.")
    return number


def _required_string(value, field):
    if not isinstance(value, str) or not value.strip():
        raise CopySightError(f"CopySight returned an invalid {field}.")
    return value.strip()


def _optional_string(value, field):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise CopySightError(f"CopySight returned an invalid {field}.")
    return value.strip()


def _normalize_finding(value, index):
    if not isinstance(value, dict):
        raise CopySightError(f"CopySight returned an invalid detected_ips[{index}].")

    similarity = _number(value.get("similarity"), f"detected_ips[{index}].similarity")
    if not 0 <= similarity <= 1:
        raise CopySightError(f"CopySight returned an out-of-range similarity for finding {index + 1}.")

    box = value.get("bounding_box")
    if not isinstance(box, dict):
        raise CopySightError(f"CopySight returned an invalid bounding box for finding {index + 1}.")
    normalized_box = {
        field: _number(box.get(field), f"detected_ips[{index}].bounding_box.{field}")
        for field in ("x", "y", "width", "height")
    }
    if any(not 0 <= number <= 1 for number in normalized_box.values()):
        raise CopySightError(f"CopySight returned an out-of-range bounding box for finding {index + 1}.")
    if normalized_box["x"] + normalized_box["width"] > 1.000001 or normalized_box["y"] + normalized_box["height"] > 1.000001:
        raise CopySightError(f"CopySight returned a bounding box outside the image for finding {index + 1}.")

    return {
        "name": _required_string(value.get("name"), f"detected_ips[{index}].name"),
        "category": _required_string(value.get("category"), f"detected_ips[{index}].category"),
        "author": _optional_string(value.get("author"), f"detected_ips[{index}].author"),
        "owner": _optional_string(value.get("owner"), f"detected_ips[{index}].owner"),
        "bounding_box": normalized_box,
        "similarity": similarity,
    }


def _normalize_response(value):
    if not isinstance(value, dict):
        raise CopySightError("CopySight returned an invalid JSON response.")
    contains_face = value.get("contains_face")
    if not isinstance(contains_face, bool):
        raise CopySightError("CopySight returned an invalid contains_face value.")
    detected_ips = value.get("detected_ips")
    if not isinstance(detected_ips, list):
        raise CopySightError("CopySight returned an invalid detected_ips value.")
    return {
        "contains_face": contains_face,
        "detected_ips": [
            _normalize_finding(finding, index)
            for index, finding in enumerate(detected_ips)
        ],
    }


def _response_payload(response):
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


def _http_error(response):
    payload = _response_payload(response) or {}
    message = payload.get("message") or payload.get("error")
    if not isinstance(message, str):
        message = ""
    message = message.strip()

    if response.status_code == 401:
        return CopySightError("CopySight rejected the API key. Set COPYSIGHT_API_KEY or update api_key.")
    if response.status_code == 400:
        detail = f": {message}" if message else "."
        return CopySightError(f"CopySight rejected the image{detail}")
    if response.status_code == 429:
        retry_after = payload.get("retry_after")
        suffix = f" Retry after {retry_after} seconds." if isinstance(retry_after, (int, float)) else ""
        return CopySightError(f"CopySight rate limit exceeded.{suffix}")
    detail = f": {message}" if message else "."
    return CopySightError(f"CopySight request failed (HTTP {response.status_code}){detail}")


def _verify_image(image_bytes, api_key):
    try:
        response = requests.post(
            VERIFY_URL,
            headers={"X-API-Key": api_key},
            files={"file": ("copysight.png", image_bytes, "image/png")},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.Timeout:
        raise CopySightError("CopySight did not respond before the request timed out.") from None
    except requests.ConnectionError:
        raise CopySightError("Could not connect to CopySight.") from None
    except requests.RequestException as error:
        raise CopySightError(f"CopySight request failed: {error}") from None

    if response.status_code != 200:
        raise _http_error(response)
    payload = _response_payload(response)
    if payload is None:
        raise CopySightError("CopySight returned an invalid JSON response.")
    return _normalize_response(payload)


def _finding_color(index):
    red, green, blue = colorsys.hsv_to_rgb((0.55 + index * COLOR_HUE_STEP) % 1, 0.72, 0.95)
    return f"#{round(red * 255):02x}{round(green * 255):02x}{round(blue * 255):02x}"


def _label_text_color(color):
    red, green, blue = (int(color[offset:offset + 2], 16) for offset in (1, 3, 5))
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    return "#0f172a" if luminance >= 150 else "#f8fafc"


def _annotate_image(image, findings):
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    width, height = annotated.size
    line_width = max(2, round(min(width, height) * 0.004))

    for index, finding in enumerate(findings):
        color = _finding_color(index)
        box = finding["bounding_box"]
        left = round(box["x"] * width)
        top = round(box["y"] * height)
        right = max(left + 1, round((box["x"] + box["width"]) * width))
        bottom = max(top + 1, round((box["y"] + box["height"]) * height))
        label = f'{finding["name"]} {finding["similarity"] * 100:.0f}%'
        text_box = draw.textbbox((0, 0), label)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        label_top = max(0, top - text_height - 6)
        label_right = min(width, left + text_width + 8)
        draw.rectangle((left, label_top, label_right, label_top + text_height + 6), fill=color)
        draw.text((left + 4, label_top + 3), label, fill=_label_text_color(color))
        draw.rectangle((left, top, right, bottom), outline=color, width=line_width)

    pixels = np.asarray(annotated, dtype=np.float32) / 255.0
    return torch.from_numpy(pixels).unsqueeze(0)


def _save_preview(image):
    result = PreviewImage().save_images(image, "copysight")
    previews = result.get("ui", {}).get("images", [])
    if not previews:
        raise RuntimeError("ComfyUI did not create the CopySight preview image.")
    return previews[0]


class CopySightVerifyImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="CopySightVerifyImage",
            display_name="CopySight Verify Image",
            category="CopySight",
            description="Check one image for similarity to protected characters, brands, people, and artwork using CopySight.",
            inputs=[
                io.Image.Input(
                    "image",
                    tooltip="One image to check. Image batches must be split before this node.",
                ),
                io.String.Input(
                    "api_key",
                    default="",
                    optional=True,
                    advanced=True,
                    tooltip="Optional CopySight API key override. Leave blank to use COPYSIGHT_API_KEY. Values entered here are saved with the workflow.",
                ),
            ],
            outputs=[
                io.Image.Output("annotated_image", tooltip="The checked image with CopySight finding boxes and labels."),
                io.String.Output("report_json", tooltip="The normalized CopySight response as JSON."),
            ],
            hidden=[io.Hidden.unique_id],
            is_api_node=True,
            not_idempotent=True,
        )

    @classmethod
    def execute(cls, image, api_key=""):
        node_id = cls.hidden.unique_id if cls.hidden is not None else None
        key = api_key.strip() or os.environ.get("COPYSIGHT_API_KEY", "").strip()

        try:
            if not key:
                raise ValueError("A CopySight API key is required. Set COPYSIGHT_API_KEY or enter api_key in the node.")

            _emit(node_id, "preparing", "Preparing image…")
            source = _image_to_pil(image)
            image_bytes = _encode_png(source)

            _emit(node_id, "checking", "Uploading image to CopySight…")
            report = _verify_image(image_bytes, key)

            _emit(node_id, "rendering", "Rendering CopySight findings…")
            annotated = _annotate_image(source, report["detected_ips"])
            preview = _save_preview(annotated)
            findings = report["detected_ips"]
            display_findings = [
                {**finding, "display_color": _finding_color(index)}
                for index, finding in enumerate(findings)
            ]
            highest_similarity = max((finding["similarity"] for finding in findings), default=0.0)
            ui_payload = {
                "preview": preview,
                "contains_face": report["contains_face"],
                "finding_count": len(findings),
                "highest_similarity": highest_similarity,
                "findings": display_findings,
            }

            _emit(node_id, "complete", "CopySight check complete.")
            return io.NodeOutput(
                annotated,
                json.dumps(report, ensure_ascii=False, separators=(",", ":")),
                ui={"copysight": [ui_payload]},
            )
        except Exception as error:
            message = _safe_error(error, key)
            _emit(node_id, "error", message)
            raise RuntimeError(f"CopySight verification failed: {message}") from None
