import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export default function AuthPanel({
  mode,
  onSwitchMode,
  onLogin,
  onRegister,
  onForgotPassword,
  loading,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      if (mode === "register") {
        if (!name.trim()) {
          setError("Please enter your name.");
          return;
        }
        await onRegister({ name: name.trim(), email: email.trim(), password });
        return;
      }
      await onLogin({ email: email.trim(), password });
    } catch (e) {
      setError(e?.message || "Something went wrong.");
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>{mode === "register" ? "Create Account" : "Sign In"}</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}

      {mode === "register" ? (
        <>
          <Text style={s.label}>NAME</Text>
          <TextInput
            style={s.input}
            placeholder="Hari Kumar"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
          />
        </>
      ) : null}

      <Text style={s.label}>EMAIL</Text>
      <TextInput
        style={s.input}
        placeholder="rider@example.com"
        placeholderTextColor="#666"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />

      <Text style={s.label}>PASSWORD</Text>
      <TextInput
        style={s.input}
        placeholder="********"
        placeholderTextColor="#666"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={s.cta} onPress={submit} disabled={loading}>
        <Text style={s.ctaText}>{loading ? "Please wait..." : mode === "register" ? "Register" : "Login"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitchMode}>
        <Text style={s.link}>
          {mode === "register" ? "Already registered? Login" : "New rider? Register here"}
        </Text>
      </TouchableOpacity>

      {mode === "login" ? (
        <TouchableOpacity onPress={() => onForgotPassword(email)}>
          <Text style={s.secondary}>Forgot password</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#121212", padding: 18, borderRadius: 14, borderWidth: 1, borderColor: "#232323" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 10 },
  error: { color: "#ff6d6d", marginBottom: 10 },
  label: { color: "#999", fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: "#1b1b1b",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2d2d2d",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cta: {
    marginTop: 16,
    backgroundColor: "#00d26a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: "#001a0f", fontWeight: "800" },
  link: { textAlign: "center", marginTop: 12, color: "#7fe9b6" },
  secondary: { textAlign: "center", marginTop: 8, color: "#9a9a9a" },
});
