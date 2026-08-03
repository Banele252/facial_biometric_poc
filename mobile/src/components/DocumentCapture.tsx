import React, { useState, useRef } from 'react';
import { View, StyleSheet, Alert, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Typography, Button } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
    onCapture: (dataUrl: string) => void;
    loading?: boolean;
    /** "SA ID" or "passport" — used in the on-screen copy. */
    documentNoun: string;
}

/**
 * Mirrors SelfieCapture, but for a photo of the customer's ID document.
 *
 * Two differences, both because a document is not a face: the rear camera is
 * used rather than the front one, since a document is held out and
 * photographed rather than framed; and the guide is a landscape rectangle
 * rather than a circle, matching the shape of the thing being photographed.
 */
export default function DocumentCapture({ onCapture, loading, documentNoun }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Typography variant="body" style={styles.text}>
          We need your permission to use the camera
        </Typography>
        <Button variant="primary" size="md" onPress={requestPermission}>
          Grant Permission
        </Button>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.9 });
      if (photo?.base64) {
        setShowCamera(false);
        onCapture(`data:image/jpeg;base64,${photo.base64}`);
      }
    } catch {
      Alert.alert('Error', 'Could not capture the document photo');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      onCapture(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef} facing="back" mode="picture">
          <View style={styles.guide} pointerEvents="none" />
          <View style={styles.cameraOverlay}>
            <Pressable style={styles.captureButton} onPress={takePicture} disabled={loading}>
              <View style={styles.captureInner} />
            </Pressable>
          </View>
        </CameraView>
        <Button variant="ghost" size="md" onPress={() => setShowCamera(false)}>
          Cancel
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Typography variant="body" color="textSecondary" align="center">
          Lay your {documentNoun} flat in good light and fill the frame
        </Typography>
      </View>
      <Button
        variant="primary"
        size="md"
        onPress={() => setShowCamera(true)}
        disabled={loading}
      >
        Open Camera
      </Button>
      <Button variant="secondary" size="md" onPress={pickImage} disabled={loading}>
        Choose from Library
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: 12 },
  text: { textAlign: 'center' },
  placeholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: '#F0F0EC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  cameraContainer: { width: '100%', height: 360, borderRadius: 20, overflow: 'hidden' },
  camera: { flex: 1 },
  // A landscape guide, so the customer frames the document rather than
  // centring it like a portrait.
  guide: {
    position: 'absolute',
    top: '18%',
    left: '6%',
    right: '6%',
    bottom: '34%',
    borderWidth: 2,
    borderColor: '#FFCB05',
    borderRadius: 12,
  },
  cameraOverlay: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
});
