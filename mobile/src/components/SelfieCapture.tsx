import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

interface Props {
    onCapture: (dataUrl: string) => void;
    loading: boolean;
}

export default function SelfieCapture({ onCapture, loading }: Props) {
    const [permission, requestPermission] = useCameraPermissions();
    const [showCamera, setShowCamera] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    if (!permission) {
        return <View />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.text}>We need your permission to use the camera</Text>
                <Pressable style={styles.button} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </Pressable>
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
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
                <Pressable style={styles.cancelButton} onPress={() => setShowCamera(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Camera preview will appear here</Text>
            </View>
            <Pressable style={styles.button} onPress={() => setShowCamera(true)} disabled={loading}>
                <Text style={styles.buttonText}>Open Camera</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={pickImage} disabled={loading}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Choose from Library</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: '100%', alignItems: 'center', gap: 12 },
    text: { fontSize: 14, color: '#5C574E', textAlign: 'center' },
    placeholder: {
        width: 280,
        height: 280,
        borderRadius: 140,
        backgroundColor: '#F0F0EC',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E0DDD6',
        borderStyle: 'dashed',
    },
    placeholderText: { fontSize: 13, color: '#8B9099', textAlign: 'center', paddingHorizontal: 20 },
    button: {
        height: 48,
        borderRadius: 24,
        backgroundColor: '#FFCB05',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        maxWidth: 280,
    },
    buttonText: { color: '#14110C', fontSize: 15, fontWeight: '700' },
    secondaryButton: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#F0DE9C' },
    secondaryText: { color: '#14110C', fontWeight: '600' },
    cameraContainer: { width: '100%', height: 400, borderRadius: 20, overflow: 'hidden' },
    camera: { flex: 1 },
    cameraOverlay: { position: 'absolute', bottom: 30, left: 0, right: 0, alignItems: 'center' },
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
    cancelButton: { marginTop: 12, alignItems: 'center' },
    cancelText: { color: '#8B9099', fontSize: 14, fontWeight: '600' },
});