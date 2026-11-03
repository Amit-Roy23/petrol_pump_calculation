import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.title}>Kalyani Fuel Station</Text>
        <Text style={styles.subtitle}>Forecourt Attendant Entry (পেট্রোল পাম্প)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's Forecourt Sheets</Text>
        <Text style={styles.cardDesc}>Select your assigned machine to record nozzle meter readings and collections.</Text>

        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Machine 219 (Dispenser 1)</Text>
          <Text style={styles.buttonSub}>Nozzles 1 & 2 (Petrol), 3 & 4 (Product B)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, { marginTop: 12 }]}>
          <Text style={styles.buttonText}>Machine 285 (Dispenser 2)</Text>
          <Text style={styles.buttonSub}>Nozzles 1 & 2 (Petrol), 3 & 4 (Product B)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Offline Resilience Active</Text>
        <Text style={styles.infoText}>
          Readings and payment collections are saved locally in real-time so forecourt data is never lost even if network drops.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  headerBox: {
    marginBottom: 20,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#047857',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonSub: {
    color: '#a7f3d0',
    fontSize: 12,
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 18,
  },
});

