from .nodes import CopySightVerifyImage


NODE_CLASS_MAPPINGS = {
    "CopySightVerifyImage": CopySightVerifyImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CopySightVerifyImage": "CopySight Verify Image",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
