"""
id_photo_extractor.py

Reusable module for detecting and cropping the face photo region out of
an ID card image using InsightFace.

Example:
    from id_photo_extractor import IDPhotoExtractor

    extractor = IDPhotoExtractor()  # defaults to buffalo_l, GPU
    extractor.extract('SA-ID-card.jpg', 'SA-ID-card-cropped.jpg')
"""

import cv2
import numpy as np
from insightface.app import FaceAnalysis


class IDPhotoExtractor:
    """
    Wraps InsightFace's FaceAnalysis to detect a face on an ID card image
    and crop out just the photo region.
    """

    def __init__(self, model_name: str = 'buffalo_l', ctx_id: int = 0,
                 det_size: tuple = (640, 640), padding: int = 20):
        """
        Initialize and prepare the InsightFace model.

        Args:
            model_name: InsightFace model pack name (e.g. 'buffalo_l', 'buffalo_s').
            ctx_id: 0 for GPU, -1 for CPU.
            det_size: Detector input size (width, height).
            padding: Default pixel padding to add around a detected face crop.
        """
        self.model_name = model_name
        self.ctx_id = ctx_id
        self.det_size = det_size
        self.padding = padding

        self.app = FaceAnalysis(name=self.model_name)
        self.app.prepare(ctx_id=self.ctx_id, det_size=self.det_size)

    def detect_faces(self, image):
        """
        Detect faces in an image.

        Args:
            image: File path (str) or pre-loaded image (np.ndarray, BGR).

        Returns:
            List of InsightFace Face objects (empty list if none detected).
        """
        img = self._load_image(image)
        return self.app.get(img)

    def crop_face(self, image, face_index: int = 0, padding: int = None):
        """
        Detect a face in an image and return the cropped photo region.

        Args:
            image: File path or np.ndarray.
            face_index: Which detected face to crop if multiple are found (default: first).
            padding: Pixel padding around the crop; falls back to self.padding if None.

        Returns:
            np.ndarray: cropped face image.

        Raises:
            ValueError: if no face is detected.
            IndexError: if face_index is out of range of detected faces.
        """
        img = self._load_image(image)
        faces = self.app.get(img)

        if len(faces) == 0:
            raise ValueError("No face detected on the ID")
        if face_index >= len(faces):
            raise IndexError(
                f"face_index {face_index} out of range; {len(faces)} face(s) detected"
            )

        pad = self.padding if padding is None else padding
        face = faces[face_index]
        x1, y1, x2, y2 = [int(v) for v in face.bbox]

        h, w = img.shape[:2]
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(w, x2 + pad)
        y2 = min(h, y2 + pad)

        return img[y1:y2, x1:x2]

    def extract(self, image, output_path: str, face_index: int = 0, padding: int = None):
        """
        Detect, crop, and save the ID photo to disk in one call.

        Args:
            image: File path or np.ndarray of the ID card.
            output_path: Where to save the cropped photo.
            face_index: Which detected face to crop if multiple are found.
            padding: Pixel padding around the crop; falls back to self.padding if None.

        Returns:
            bool: True if a face was found and saved, False if no face was detected.
        """
        try:
            cropped = self.crop_face(image, face_index=face_index, padding=padding)
        except ValueError:
            print("No face detected on the ID")
            return False

        cv2.imwrite(output_path, cropped)
        print("Photo extracted and saved.")
        return True

    @staticmethod
    def _load_image(image):
        """Load an image from a path if a string is given, else assume it's already an array."""
        if isinstance(image, str):
            img = cv2.imread(image)
            if img is None:
                raise FileNotFoundError(f"Could not read image at path: {image}")
            return img
        return image


if __name__ == '__main__':
    # Quick manual test when running this file directly
    extractor = IDPhotoExtractor()
    extractor.extract('SA-ID-card.jpg', 'SA-ID-card-cropped2.jpg')