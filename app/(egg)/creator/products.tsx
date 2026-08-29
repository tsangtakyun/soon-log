import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { BackHeader } from "@/components/BackHeader";
import { loadEggProducts, saveEggProduct, type EggProduct } from "@/lib/eggApi";
import { fonts } from "@/lib/theme";
import { colors } from "@/theme/colors";

const typeLabels: Record<EggProduct["product_type"], string> = {
  physical: "實體產品",
  digital: "數位產品",
  service: "服務",
  workshop: "工作坊",
  other: "其他",
};

export default function EggProductsScreen() {
  const [products, setProducts] = useState<EggProduct[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EggProduct | null>(null);
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<EggProduct["product_type"]>("digital");
  const [externalUrl, setExternalUrl] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await loadEggProducts();
      setProducts(data.products);
      setCanEdit(data.canEdit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "未能載入產品");
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openForm(product?: EggProduct) {
    setEditing(product ?? null);
    setTitle(product?.title ?? "");
    setDescription(product?.description ?? "");
    setPrice(product?.price == null ? "" : String(product.price));
    setType(product?.product_type ?? "digital");
    setExternalUrl(product?.external_url ?? "");
    setActive(product?.is_active !== false);
    setModal(true);
  }

  async function save() {
    setSaving(true);
    try {
      await saveEggProduct({
        id: editing?.id,
        title,
        description,
        price,
        currency: "HKD",
        product_type: type,
        external_url: externalUrl,
        is_unlimited_stock: true,
        is_active: active,
      });
      setModal(false);
      await load();
    } catch (cause) {
      Alert.alert(
        "儲存失敗",
        cause instanceof Error ? cause.message : "請稍後再試",
      );
    } finally {
      setSaving(false);
    }
  }

  function archive(product: EggProduct) {
    Alert.alert("刪除產品？", "產品會由商店隱藏，已有訂單不受影響。", [
      { text: "取消", style: "cancel" },
      {
        text: "刪除",
        style: "destructive",
        onPress: () =>
          void saveEggProduct({ action: "archive", id: product.id })
            .then(load)
            .catch((cause) =>
              Alert.alert(
                "刪除失敗",
                cause instanceof Error ? cause.message : "請稍後再試",
              ),
            ),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <BackHeader title="數位產品" backTo="/(egg)/creator/more" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <View style={styles.flex}>
            <Text style={styles.heading}>你的產品與服務</Text>
            <Text style={styles.body}>
              App 同網站共用同一批產品，更新後公開商店會即時同步。
            </Text>
          </View>
          {canEdit ? (
            <Pressable style={styles.add} onPress={() => openForm()}>
              <Feather name="plus" size={18} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? (
          <Pressable style={styles.error} onPress={() => void load()}>
            <Text style={styles.errorText}>{error} · 重試</Text>
          </Pressable>
        ) : null}
        {!loading && !error && products.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="shopping-bag" size={30} color={colors.textMuted} />
            <Text style={styles.heading}>未有產品</Text>
            <Text style={styles.body}>
              新增電子書、服務、工作坊或實體產品。
            </Text>
          </View>
        ) : null}
        {products.map((product) => (
          <Pressable
            key={product.id}
            disabled={!canEdit}
            onPress={() => openForm(product)}
            style={styles.card}
          >
            <View style={styles.productIcon}>
              <Feather
                name={
                  product.product_type === "digital"
                    ? "download"
                    : "shopping-bag"
                }
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={styles.flex}>
              <View style={styles.row}>
                <Text style={styles.productTitle}>{product.title}</Text>
                <Text
                  style={[
                    styles.status,
                    product.is_active === false && styles.inactive,
                  ]}
                >
                  {product.is_active === false ? "已隱藏" : "公開"}
                </Text>
              </View>
              <Text style={styles.body}>
                {typeLabels[product.product_type]} · {product.currency || "HKD"}{" "}
                {Number(product.price || 0).toLocaleString()}
              </Text>
              {product.description ? (
                <Text numberOfLines={2} style={styles.description}>
                  {product.description}
                </Text>
              ) : null}
            </View>
            {canEdit ? (
              <Pressable hitSlop={10} onPress={() => archive(product)}>
                <Feather name="trash-2" size={18} color="#dc2626" />
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      <Modal
        visible={modal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(false)}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setModal(false)}>
              <Text style={styles.link}>取消</Text>
            </Pressable>
            <Text style={styles.heading}>
              {editing ? "編輯產品" : "新增產品"}
            </Text>
            <Pressable disabled={saving} onPress={() => void save()}>
              <Text style={styles.link}>{saving ? "儲存中…" : "儲存"}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <Field label="產品名稱">
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={styles.input}
                placeholder="例如：IG Reels 拍攝服務"
              />
            </Field>
            <Text style={styles.label}>類型</Text>
            <View style={styles.types}>
              {(Object.keys(typeLabels) as EggProduct["product_type"][]).map(
                (item) => (
                  <Pressable
                    key={item}
                    onPress={() => setType(item)}
                    style={[styles.type, type === item && styles.typeActive]}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        type === item && styles.typeTextActive,
                      ]}
                    >
                      {typeLabels[item]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            <Field label="售價（HKD）">
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />
            </Field>
            <Field label="介紹">
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                style={[styles.input, styles.textarea]}
                placeholder="產品內容及交付方式"
              />
            </Field>
            <Field label="購買／詳情連結（選填）">
              <TextInput
                value={externalUrl}
                onChangeText={setExternalUrl}
                autoCapitalize="none"
                keyboardType="url"
                style={styles.input}
                placeholder="https://"
              />
            </Field>
            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>公開顯示</Text>
                <Text style={styles.body}>關閉後唔會喺公開商店出現</Text>
              </View>
              <Switch
                value={active}
                onValueChange={setActive}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 42 },
  flex: { flex: 1 },
  intro: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  body: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginTop: 3,
  },
  add: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
  },
  productIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#f8eeea",
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  productTitle: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    marginTop: 8,
    lineHeight: 18,
  },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: "#15803d",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  inactive: { color: colors.textMuted, backgroundColor: "#f1f0ef" },
  empty: {
    alignItems: "center",
    gap: 8,
    padding: 34,
    borderRadius: 20,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
  },
  error: { padding: 14, borderRadius: 14, backgroundColor: "#fef2f2" },
  errorText: { color: "#b91c1c", fontFamily: fonts.bodyMedium },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.bodyBorder,
  },
  link: { color: colors.primary, fontFamily: fonts.bodyBold, fontSize: 15 },
  form: { padding: 20, gap: 18 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bodyBold, color: colors.text, fontSize: 14 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  textarea: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  type: {
    borderWidth: 1,
    borderColor: colors.bodyBorder,
    borderRadius: 99,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  typeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontFamily: fonts.bodyMedium, color: colors.textMuted },
  typeTextActive: { color: "#fff" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
