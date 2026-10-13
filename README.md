# ComfyUI-CopySight

CopySight image IP similarity verification inside ComfyUI. The pack adds one API node with an embedded result panel, annotated image output, and structured JSON.

CopySight documentation: https://copysight.ai/docs

Original node by [Filliptm / Machine Delusions](https://github.com/filliptm). CopySight maintains this distribution under the existing Apache-2.0 license. Packaging, documentation, and the example workflow were updated for public distribution; the verification implementation is unchanged from the original node.

## Requirements

- ComfyUI Local or Desktop. Tested with ComfyUI 0.39.2, frontend 1.53.10, and Python 3.13.12 on Apple Silicon.
- Python 3.10 or newer, subject to the Python requirements of your ComfyUI installation.
- An enabled CopySight key with access to image verification. Installing the node does not include CopySight credits or a subscription.

Comfy Cloud maintains its own supported node list. Publishing this package does not automatically make it available in Cloud. See [custom nodes on Cloud](https://support.comfy.org/articles/6791455062-custom-nodes-on-cloud).

## Installation

When this package is listed in your ComfyUI-Manager catalog, search for **CopySight**, install it, and restart ComfyUI. If it is not listed, use the manual steps below. Comfy Registry publication and Manager catalog review are separate from publishing the GitHub source.

1. Download this repository or clone it into your ComfyUI installation's `custom_nodes` directory:

   ```bash
   git clone https://github.com/copysight/ComfyUI-CopySight.git custom_nodes/ComfyUI-CopySight
   ```

   Run this from the ComfyUI directory. Desktop users should use the directory of their local instance. Do not select the application's installation directory or a Cloud instance.
2. Install its Python dependency:

   ```bash
   python -m pip install -r custom_nodes/ComfyUI-CopySight/requirements.txt
   ```

   Use the Python environment that runs ComfyUI. For a Local/Desktop installation with a `.venv` folder on macOS/Linux:

   ```bash
   .venv/bin/python -m pip install -r custom_nodes/ComfyUI-CopySight/requirements.txt
   ```

3. Configure your own CopySight key. You can enter it in the node's advanced `api_key` field. For workflows you share, leave that field empty and set `COPYSIGHT_API_KEY` in the environment that starts ComfyUI instead.

   macOS/Linux (Bash):

   ```bash
   read -r -s -p "CopySight key: " COPYSIGHT_API_KEY
   printf '\n'
   export COPYSIGHT_API_KEY
   ```

   macOS (Zsh):

   ```zsh
   read -r -s 'COPYSIGHT_API_KEY?CopySight key: '
   printf '\n'
   export COPYSIGHT_API_KEY
   ```

   Then start ComfyUI from that same terminal. A Desktop instance launched independently will not inherit the environment of an unrelated terminal. Do not paste a real key into shell commands that are recorded in history.

   PowerShell:

   ```powershell
   $env:COPYSIGHT_API_KEY = "your-key"
   ```

   Command Prompt:

   ```bat
   set COPYSIGHT_API_KEY=your-key
   ```

4. Restart ComfyUI.

The node also has an advanced `api_key` override. Values entered in the node are saved with the workflow, so the environment variable is recommended.

## First check

1. Open `example_workflows/CopySight Verify Image.json` in ComfyUI. It contains `Load Image → CopySight Verify Image → Preview Image` and no key.
2. Choose your own image in Load Image. You can also use the included `example_workflows/example.png`, a synthetic image with no personal content. It is a wiring test, not an example of a positive IP match.
3. Configure your enabled CopySight key. The account menu at [CopySight](https://demo.copysight.ai/verify) exposes a separate **ComfyUI Key**. If that key is not enabled for this endpoint, contact CopySight through your existing support channel; a standard API plan and creator access may have different permissions.
4. Check the current account limits and cost before clicking Run. Each execution sends one image to CopySight. Queue size, automatic queueing, and rerunning the workflow can cause additional requests and charges.
5. Click Run once. A successful response appears in the node panel, in Preview Image, and in `report_json`.

The key used to publish packages to Comfy Registry is a separate credential. It is never a verification key and must not be entered in this node.

## Node

### CopySight Verify Image

Category: `CopySight`

Inputs:

- `image`: one ComfyUI image. Image batches are rejected to prevent accidental multiple API charges.
- `api_key`: optional advanced override. Empty uses `COPYSIGHT_API_KEY`.

Outputs:

- `annotated_image`: the checked image with local bounding boxes and labels.
- `report_json`: normalized CopySight response JSON.

Queueing the node makes one request to:

```text
POST https://api.copysight.ai/v1/verify
```

The image is converted to PNG in memory and sent as the documented multipart `file` field with the `X-API-Key` header. There are no startup requests, background uploads, retries, analytics, or persistent caches.

## Embedded interface

The node panel reports preparation, upload, rendering, completion, and errors. A completed check shows:

- annotated image preview;
- finding count;
- highest similarity;
- face presence;
- findings sorted by similarity, including category, author, and owner.

The panel intentionally has no independent Verify button or file picker. ComfyUI graph execution owns the request, and any upstream image node owns image loading.

## Limitations

- CopySight's public v1 API documents image verification only. Video is not exposed by this node.
- Animated GIF timing is not preserved by a ComfyUI `IMAGE` input.
- Only one image is accepted per execution.
- A synchronous request may remain active until its timeout if execution is interrupted after upload.
- CopySight does not document an overall CopyScore in the v1 response. The panel's Highest match is only the maximum individual finding score.

## Privacy and interpretation

The connected image leaves the local machine only when this node is queued. API keys are never sent to the browser panel or included in the result payload. Errors redact the active key before being displayed.

CopySight results are similarity evidence, not a legal determination that content is safe, infringing, licensed, or copyright-free.

## Errors

The node fails the ComfyUI execution and shows an inline message for:

- missing or rejected API keys;
- unsupported or rejected images;
- rate limiting, including `retry_after` when supplied;
- connection and timeout failures;
- malformed provider responses.

It does not return placeholder images or silently drop invalid findings.

If access is refused, check the key's status and permissions before retrying. If the account is out of credits or over its quota, review [Usage](https://demo.copysight.ai/usage) and [Plans](https://demo.copysight.ai/plans); the node does not purchase credits or change your subscription. Authentication, quota, and billing are enforced by the CopySight service, not by hiding the node's source code.

## Development tests

The Python tests use mocked HTTP responses and require the dependencies of a ComfyUI installation. Run them from the ComfyUI root with the Python environment that runs ComfyUI. Replace `ComfyUI-CopySight` below if your installed directory has a different name (Registry installations may use `copysight`):

```bash
python -c "import comfy.cli_args; comfy.cli_args.args.cpu = True; import runpy; runpy.run_path('custom_nodes/ComfyUI-CopySight/tests/test_verify_image.py', run_name='__main__')"
node --test custom_nodes/ComfyUI-CopySight/tests/test_copysight_ui.mjs
```

These tests do not call CopySight or verify a real key, subscription, credit deduction, or payment. Live checks need an enabled test account and an approved credit budget.
