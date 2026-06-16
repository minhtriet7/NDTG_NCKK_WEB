import api, { normalizeList } from "./api";

export async function getMe() {
  return await api.get("/users/me");
}

export async function updateMe(payload) {
  return await api.put("/users/me", payload);
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  return await api.post("/users/me/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

export async function getProfileStats() {
  return await api.get("/users/me/stats");
}

export async function getProfileConfig() {
  return await api.get("/users/me/profile-config");
}

export async function getPreferences() {
  return await api.get("/users/me/preferences");
}

export async function updatePreferences(payload) {
  return await api.put("/users/me/preferences", payload);
}

export async function changePassword(payload) {
  return await api.put("/users/me/password", payload);
}

export async function setPassword(payload) {
  return await changePassword({
    current_password: payload.current_password || null,
    new_password: payload.new_password,
  });
}

export async function getMyHistory() {
  const data = await api.get("/users/me/history");
  return normalizeList(data);
}

export async function getMyScanStats() {
  try {
    const history = await getMyHistory();

    return {
      total_scans: history.length,
      completed: history.filter((item) =>
        ["Completed", "High Consensus", "Partial Success", "success"].includes(
          item.status
        )
      ).length,
      needs_review: history.filter((item) =>
        ["Conflict Detected", "Failed", "Needs Review"].includes(item.status)
      ).length,
      last_scan_at: history.length > 0 ? history[0].created_at : null,
    };
  } catch (error) {
    console.error("Lỗi lấy lịch sử quét:", error);
    return null;
  }
}

export async function getMyTransactions(limit = 5) {
  try {
    const data = await api.get("/users/me/transactions", {
      params: { limit },
    });

    return normalizeList(data);
  } catch (error) {
    console.error("Lỗi lấy lịch sử giao dịch:", error);
    return [];
  }
}

export async function logoutSession() {
  return true;
}
