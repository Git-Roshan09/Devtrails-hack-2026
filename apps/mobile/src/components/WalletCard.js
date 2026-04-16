import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function WalletCard({ totalPaid, transactions }) {
  return (
    <View style={s.card}>
      <Text style={s.title}>Recent Payouts</Text>
      <Text style={s.amount}>Rs {Number(totalPaid || 0).toFixed(0)}</Text>
      <Text style={s.sub}>Total paid in recent claims</Text>

      <View style={s.sep} />
      <Text style={s.title}>Recent Transactions</Text>
      {transactions.length === 0 ? <Text style={s.sub}>No transactions yet.</Text> : null}

      {transactions.slice(0, 5).map((t) => (
        <View key={t.id} style={s.row}>
          <View>
            <Text style={s.rowTitle}>{t.label}</Text>
            <Text style={s.rowMeta}>{t.date}</Text>
          </View>
          <Text style={[s.rowAmount, { color: t.amount >= 0 ? "#00d26a" : "#ff7c7c" }]}>
            {t.amount >= 0 ? "+" : "-"}Rs {Math.abs(t.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#121212", borderColor: "#252525", borderWidth: 1, borderRadius: 14, padding: 16 },
  title: { color: "#fff", fontWeight: "700", fontSize: 16 },
  amount: { color: "#00d26a", fontWeight: "800", fontSize: 28, marginTop: 4 },
  sub: { color: "#9a9a9a", marginTop: 4 },
  sep: { height: 1, backgroundColor: "#252525", marginVertical: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowTitle: { color: "#f1f1f1", fontWeight: "600" },
  rowMeta: { color: "#8f8f8f", fontSize: 12, marginTop: 2 },
  rowAmount: { fontWeight: "700" },
});
