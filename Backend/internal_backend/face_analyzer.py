"""
face_analyzer.py

Reusable module for detecting faces in an image and reporting their
attributes (bounding box, embedding, age, gender) using InsightFace.
"""

import cv2
from insightface.app import FaceAnalysis


class FaceAnalyzer:
    """
    Wraps InsightFace's FaceAnalysis to detect faces in an image and
    report their bounding box, embedding, age, and gender.
    """

    def __init__(self, model_name: str = 'buffalo_l', ctx_id: int = 0,
                 det_size: tuple = (640, 640)):
        self.model_name = model_name
        self.ctx_id = ctx_id
        self.det_size = det_size

        self.app = FaceAnalysis(name=self.model_name)
        self.app.prepare(ctx_id=self.ctx_id, det_size=self.det_size)

    def detect_faces(self, image):
        img = self._load_image(image)
        return self.app.get(img)

    def analyze(self, image, verbose: bool = False):
        faces = self.detect_faces(image)
        results = []

        for face in faces:
            info = {
                'bbox': face.bbox,
                'embedding': face.embedding,
                'age': face.age,
                'gender': face.sex,
            }
            results.append(info)

            if verbose:
                print("Bounding box:", info['bbox'])
                print("Embedding shape:", info['embedding'].shape)
                print("Age:", info['age'])
                print("Gender:", info['gender'])

        return results

    @staticmethod
    def _load_image(image):
        if isinstance(image, str):
            img = cv2.imread(image)
            if img is None:
                raise FileNotFoundError(f"Could not read image at path: {image}")
            return img
        return image


if __name__ == '__main__':
    analyzer = FaceAnalyzer()
    analyzer.analyze('SA-ID-card.jpg', verbose=True)