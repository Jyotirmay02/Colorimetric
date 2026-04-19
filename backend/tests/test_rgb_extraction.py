"""
Backend API tests for RGB extraction endpoints.
Tests health check, full-image RGB extraction, region-based sampling, and error handling.
"""
import pytest
import requests
import os
import base64
import io
from PIL import Image


BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def create_solid_color_image(r: int, g: int, b: int, width: int = 100, height: int = 100) -> str:
    """Create a solid color image and return base64 encoded string"""
    img = Image.new('RGB', (width, height), color=(r, g, b))
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode('utf-8')


def create_two_color_image(color1: tuple, color2: tuple, width: int = 100, height: int = 100) -> str:
    """Create an image with two colors (left half color1, right half color2)"""
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    for x in range(width):
        for y in range(height):
            if x < width // 2:
                pixels[x, y] = color1
            else:
                pixels[x, y] = color2
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode('utf-8')


class TestHealthEndpoint:
    """Health check endpoint tests"""

    def test_health_check(self, api_client):
        """Test GET /api/ returns health message"""
        response = api_client.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "message" in data, "Response should contain 'message' field"
        assert "Chemistry" in data["message"] or "RGB" in data["message"], \
            f"Health message should mention Chemistry or RGB, got: {data['message']}"
        print(f"✓ Health check passed: {data['message']}")


class TestFullImageRGBExtraction:
    """Full-image RGB extraction tests with synthetic images"""

    def test_extract_pure_red(self, api_client):
        """Test extraction of pure red image (255, 0, 0)"""
        base64_img = create_solid_color_image(255, 0, 0)
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["r"] == 255, f"Expected R=255, got {data['r']}"
        assert data["g"] == 0, f"Expected G=0, got {data['g']}"
        assert data["b"] == 0, f"Expected B=0, got {data['b']}"
        assert data["hex"] == "#FF0000", f"Expected #FF0000, got {data['hex']}"
        assert "image_width" in data and data["image_width"] == 100
        assert "image_height" in data and data["image_height"] == 100
        print(f"✓ Pure red extraction passed: R={data['r']}, G={data['g']}, B={data['b']}, HEX={data['hex']}")

    def test_extract_pure_green(self, api_client):
        """Test extraction of pure green image (0, 255, 0)"""
        base64_img = create_solid_color_image(0, 255, 0)
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["r"] == 0
        assert data["g"] == 255
        assert data["b"] == 0
        assert data["hex"] == "#00FF00"
        print(f"✓ Pure green extraction passed: {data['hex']}")

    def test_extract_pure_blue(self, api_client):
        """Test extraction of pure blue image (0, 0, 255)"""
        base64_img = create_solid_color_image(0, 0, 255)
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["r"] == 0
        assert data["g"] == 0
        assert data["b"] == 255
        assert data["hex"] == "#0000FF"
        print(f"✓ Pure blue extraction passed: {data['hex']}")

    def test_extract_gray(self, api_client):
        """Test extraction of gray image (128, 128, 128)"""
        base64_img = create_solid_color_image(128, 128, 128)
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["r"] == 128
        assert data["g"] == 128
        assert data["b"] == 128
        assert data["hex"] == "#808080"
        print(f"✓ Gray extraction passed: {data['hex']}")

    def test_extract_with_data_uri_prefix(self, api_client):
        """Test extraction with data URI prefix (data:image/png;base64,...)"""
        base64_img = create_solid_color_image(100, 150, 200)
        data_uri = f"data:image/png;base64,{base64_img}"
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": data_uri
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["r"] == 100
        assert data["g"] == 150
        assert data["b"] == 200
        print(f"✓ Data URI prefix handling passed: R={data['r']}, G={data['g']}, B={data['b']}")


class TestRegionBasedRGBExtraction:
    """Region-based RGB extraction tests with normalized coordinates"""

    def test_extract_left_region(self, api_client):
        """Test extraction from left half of two-color image"""
        # Left half red (255,0,0), right half blue (0,0,255)
        base64_img = create_two_color_image((255, 0, 0), (0, 0, 255), width=200, height=200)
        
        # Sample from left region (x=0.25, y=0.5 should be in red area)
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img,
            "x": 0.25,
            "y": 0.5,
            "region_size": 0.08
        })
        assert response.status_code == 200
        
        data = response.json()
        # Should be predominantly red
        assert data["r"] > 200, f"Expected R > 200 for red region, got {data['r']}"
        assert data["g"] < 50, f"Expected G < 50 for red region, got {data['g']}"
        assert data["b"] < 50, f"Expected B < 50 for red region, got {data['b']}"
        assert "sampled_region" in data
        assert data["sampled_region"] is not None
        print(f"✓ Left region extraction passed: R={data['r']}, G={data['g']}, B={data['b']}")

    def test_extract_right_region(self, api_client):
        """Test extraction from right half of two-color image"""
        # Left half red (255,0,0), right half blue (0,0,255)
        base64_img = create_two_color_image((255, 0, 0), (0, 0, 255), width=200, height=200)
        
        # Sample from right region (x=0.75, y=0.5 should be in blue area)
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img,
            "x": 0.75,
            "y": 0.5,
            "region_size": 0.08
        })
        assert response.status_code == 200
        
        data = response.json()
        # Should be predominantly blue
        assert data["r"] < 50, f"Expected R < 50 for blue region, got {data['r']}"
        assert data["g"] < 50, f"Expected G < 50 for blue region, got {data['g']}"
        assert data["b"] > 200, f"Expected B > 200 for blue region, got {data['b']}"
        assert "sampled_region" in data
        print(f"✓ Right region extraction passed: R={data['r']}, G={data['g']}, B={data['b']}")

    def test_extract_center_region(self, api_client):
        """Test extraction from center of image"""
        base64_img = create_solid_color_image(50, 100, 150)
        
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img,
            "x": 0.5,
            "y": 0.5,
            "region_size": 0.1
        })
        assert response.status_code == 200
        
        data = response.json()
        assert data["r"] == 50
        assert data["g"] == 100
        assert data["b"] == 150
        assert data["sampled_region"]["center_x"] == 50  # 0.5 * 100
        assert data["sampled_region"]["center_y"] == 50
        print(f"✓ Center region extraction passed with sampled_region data")

    def test_extract_corner_regions(self, api_client):
        """Test extraction from corner coordinates (boundary testing)"""
        base64_img = create_solid_color_image(75, 75, 75)
        
        # Test top-left corner
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img,
            "x": 0.0,
            "y": 0.0,
            "region_size": 0.05
        })
        assert response.status_code == 200
        data = response.json()
        assert data["r"] == 75
        print(f"✓ Top-left corner extraction passed")
        
        # Test bottom-right corner
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": base64_img,
            "x": 1.0,
            "y": 1.0,
            "region_size": 0.05
        })
        assert response.status_code == 200
        data = response.json()
        assert data["r"] == 75
        print(f"✓ Bottom-right corner extraction passed")


class TestErrorHandling:
    """Error handling tests for invalid inputs"""

    def test_invalid_base64(self, api_client):
        """Test that invalid base64 returns HTTP 400"""
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": "this_is_not_valid_base64!@#$%"
        })
        assert response.status_code == 400, f"Expected 400 for invalid base64, got {response.status_code}"
        print(f"✓ Invalid base64 correctly returns 400")

    def test_empty_base64(self, api_client):
        """Test that empty base64 returns HTTP 400"""
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": ""
        })
        assert response.status_code == 400, f"Expected 400 for empty base64, got {response.status_code}"
        print(f"✓ Empty base64 correctly returns 400")

    def test_corrupted_image_data(self, api_client):
        """Test that corrupted image data returns HTTP 400"""
        # Valid base64 but not a valid image
        corrupted = base64.b64encode(b"not an image file").decode('utf-8')
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "image_base64": corrupted
        })
        assert response.status_code == 400, f"Expected 400 for corrupted image, got {response.status_code}"
        print(f"✓ Corrupted image data correctly returns 400")

    def test_missing_image_field(self, api_client):
        """Test that missing image_base64 field returns HTTP 422 (validation error)"""
        response = api_client.post(f"{BASE_URL}/api/extract-rgb", json={
            "x": 0.5,
            "y": 0.5
        })
        # FastAPI Pydantic validation returns 422 for missing required fields
        assert response.status_code == 422, f"Expected 422 for missing field, got {response.status_code}"
        print(f"✓ Missing image_base64 field correctly returns 422")


if __name__ == "__main__":
    print(f"Testing backend at: {BASE_URL}")
    pytest.main([__file__, "-v", "--tb=short"])
