"""
face_matcher.py

Reusable module for face detection and face-similarity comparison
using InsightFace.

Example:
    from face_matcher import FaceMatcher

    matcher = FaceMatcher()  # defaults to buffalo_l, GPU
    similarity = matcher.compare_faces('dlamini.jpg', 'SA-ID-card-cropped.jpg')
    print(f"Similarity: {similarity:.2f}%")
"""

import cv2
import numpy as np
from insightface.app import FaceAnalysis


class FaceMatcher:
    """
    Wraps InsightFace's FaceAnalysis to provide simple face detection,
    embedding extraction, and face-to-face similarity comparison.
    """

    def __init__(self, model_name: str = 'buffalo_l', ctx_id: int = 0,
                 det_size: tuple = (640, 640)):
        """
        Initialize and prepare the InsightFace model.

        Args:
            model_name: InsightFace model pack name (e.g. 'buffalo_l', 'buffalo_s').
            ctx_id: 0 for GPU, -1 for CPU.
            det_size: Detector input size (width, height).
        """
        self.model_name = model_name
        self.ctx_id = ctx_id
        self.det_size = det_size

        self.app = FaceAnalysis(name=self.model_name)
        self.app.prepare(ctx_id=self.ctx_id, det_size=self.det_size)

    def get_faces(self, image):
        """
        Detect faces in an image.

        Args:
            image: Either a file path (str) or a pre-loaded image (np.ndarray, BGR).

        Returns:
            List of InsightFace Face objects (empty list if none detected).
        """
        img = self._load_image(image)
        return self.app.get(img)

    def get_embedding(self, image, face_index: int = 0):
        """
        Get the embedding vector for a face in an image.

        Args:
            image: File path or np.ndarray.
            face_index: Which detected face to use if multiple are found (default: first).

        Returns:
            np.ndarray embedding, or None if no face was detected.
        """
        faces = self.get_faces(image)
        if not faces:
            return None
        if face_index >= len(faces):
            raise IndexError(
                f"face_index {face_index} out of range; {len(faces)} face(s) detected"
            )
        return faces[face_index].embedding

    def compare_faces(self, image1, image2, face_index1: int = 0, face_index2: int = 0):
        """
        Compare two images and return the cosine similarity between their
        primary detected faces, as a percentage.

        Args:
            image1: File path or np.ndarray for the first image.
            image2: File path or np.ndarray for the second image.
            face_index1: Which face to use in image1 if multiple detected.
            face_index2: Which face to use in image2 if multiple detected.

        Returns:
            float: similarity score as a percentage (0-100).

        Raises:
            ValueError: if a face could not be detected in either image.
        """
        emb1 = self.get_embedding(image1, face_index1)
        emb2 = self.get_embedding(image2, face_index2)

        if emb1 is None:
            raise ValueError(f"No face detected in image1: {image1}")
        if emb2 is None:
            raise ValueError(f"No face detected in image2: {image2}")

        similarity = self._cosine_similarity(emb1, emb2)
        return similarity * 100

    def is_match(self, image1, image2, threshold: float = 30.0):
        """
        Convenience method: returns True/False plus the similarity score,
        based on a similarity threshold (percentage).

        Args:
            image1: File path or np.ndarray.
            image2: File path or np.ndarray.
            threshold: Minimum similarity percentage to count as a match (default 60%).

        Returns:
            (bool, float): (is_match, similarity_percentage)
        """
        similarity = self.compare_faces(image1, image2)
        return similarity >= threshold, similarity

    @staticmethod
    def _cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
        return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))

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
    matcher = FaceMatcher()
    score = matcher.compare_faces('dlamini.jpg', 'SA-ID-card-cropped.jpg')
    print(f"Similarity: {score:.2f}%")