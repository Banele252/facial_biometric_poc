import cv2
import insightface
from insightface.app import FaceAnalysis
import numpy as np

# Initialize the app (downloads models automatically on first run)
app = FaceAnalysis(name='buffalo_l')  # buffalo_l = default, most accurate model pack
app.prepare(ctx_id=0, det_size=(640, 640))  # ctx_id=0 for GPU, -1 for CPU

# Load an image
img = cv2.imread('SA-ID-card.jpg')

# Detect and analyze faces
faces = app.get(img)

for face in faces:
    print("Bounding box:", face.bbox)
    print("Embedding shape:", face.embedding.shape)  # 512-d vector for recognition
    print("Age:", face.age)
    print("Gender:", face.sex)



img1 = cv2.imread('dlamini.jpg')
img2 = cv2.imread('SA-ID-card.jpg')

faces1 = app.get(img1)
faces2 = app.get(img2)

emb1 = faces1[0].embedding
emb2 = faces2[0].embedding

# Cosine similarity
similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
print("Similarity:", similarity)




# Initialize
app = FaceAnalysis(name='buffalo_l')
app.prepare(ctx_id=0, det_size=(640, 640))  # ctx_id=-1 if no GPU

# Load the ID card image
img = cv2.imread('SA-ID-card.jpg')

# Detect faces
faces = app.get(img)

if len(faces) == 0:
    print("No face detected on the ID")
else:
    # Assume the first detected face is the ID photo
    face = faces[0]
    x1, y1, x2, y2 = [int(v) for v in face.bbox]

    # Add some padding around the face (optional, so you don't crop too tight)
    pad = 20
    h, w = img.shape[:2]
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)

    # Crop the photo region
    cropped_face = img[y1:y2, x1:x2]

    # Save it
    cv2.imwrite('SA-ID-card-cropped.jpg', cropped_face)
    print("Photo extracted and saved.")


