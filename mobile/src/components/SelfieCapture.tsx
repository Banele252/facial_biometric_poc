import React, { useState, useRef } from 'react';
import { View, StyleSheet, Alert, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Typography, Button } from '@/components/ui';
import { Colors } from '@/theme';

interface Props {
    onCapture: (dataUrl: string) => void;
    loading: boolean;
}

export default function SelfieCapture({ onCapture, loading }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Typography variant="body" style={styles.text}>We need your permission to use the camera</Typography>
        <Button variant="primary" size="md" onPress={requestPermission}>Grant Permission</Button>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      if (photo?.base64) {
        setShowCamera(false);
        onCapture(`data:image/jpeg;base64,${photo.base64}`);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      onCapture(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} ref={cameraRef} facing="front">
          <View style={styles.cameraOverlay}>
            <Pressable style={styles.captureButton} onPress={takePicture} disabled={loading}>
              <View style={styles.captureInner} />
            </Pressable>
          </View>
        </CameraView>
        <Button variant="ghost" size="md" onPress={() => setShowCamera(false)}>Cancel</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Typography variant="body" color="textSecondary" align="center">Camera preview will appear here</Typography>
      </View>
      <Button variant="primary" size="md" onPress={() => setShowCamera(true)} disabled={loading}>
          Open Camera</Button>
      <Button variant="secondary" size="md" onPress={pickImage} disabled={loading}>Choose from Library</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', gap: 12 },
  text: { textAlign: 'center' },
  placeholder: {
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#F0F0EC', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
  },
  cameraContainer: { width: '100%', height: 400, borderRadius: 20, overflow: 'hidden' },
  camera: { flex: 1 },
  cameraOverlay: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4, borderColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
});