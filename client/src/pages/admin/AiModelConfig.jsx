import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { getAiModelConfig, updateAiModelConfig } from "../../services/adminService";
import { Cpu, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import toast from "react-hot-toast";

export default function AiModelConfig() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [form, setForm] = useState({
    yolo_model_path: "ml_models/yolo/best.pt",
    res_model_path: "ml_models/res/banknote_resnet50_stable_best.pth",
    res_classes_path: "ml_models/res/classes.txt",
    yolo_conf_threshold: 0.25,
    yolo_img_size: 640,
    res_img_size: 224,
    device: "auto",
    enabled: true,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    EN: {
      title: "AI Model Config",
      subtitle: "Configure Agent 1 ML/DL model paths, image sizes, and detection thresholds.",
      refresh: "Refresh",
      save: "Save Changes",
      saving: "Saving...",
      modelPaths: "Model paths",
      parameters: "Inference parameters",
      yoloPath: "YOLO model path",
      resPath: "RES classifier path",
      classesPath: "Classes file path",
      conf: "YOLO confidence threshold",
      yoloSize: "YOLO image size",
      resSize: "Classifier image size",
      device: "Device",
      enabled: "Enable Agent 1 ML/DL",
      saved: "AI model configuration saved.",
      failedLoad: "Failed to load AI model config.",
      failedSave: "Failed to save AI model config.",
    },
    VI: {
      title: "Cấu hình AI Model",
      subtitle: "Cấu hình đường dẫn model Agent 1 ML/DL, kích thước ảnh và ngưỡng nhận diện.",
      refresh: "Tải lại",
      save: "Lưu thay đổi",
      saving: "Đang lưu...",
      modelPaths: "Đường dẫn model",
      parameters: "Tham số inference",
      yoloPath: "Đường dẫn YOLO model",
      resPath: "Đường dẫn RES classifier",
      classesPath: "Đường dẫn classes.txt",
      conf: "Ngưỡng confidence YOLO",
      yoloSize: "Kích thước ảnh YOLO",
      resSize: "Kích thước ảnh classifier",
      device: "Thiết bị chạy",
      enabled: "Bật Agent 1 ML/DL",
      saved: "Đã lưu cấu hình AI model.",
      failedLoad: "Không thể tải cấu hình AI model.",
      failedSave: "Không thể lưu cấu hình AI model.",
    },
  }[lang || "EN"];

  const cardClass = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const inputClass = isDark
    ? "bg-slate-950 border-slate-800 text-white"
    : "bg-slate-50 border-slate-200 text-slate-900";

  const normalizeConfig = (data) => data?.config || data?.settings || data?.data || data || {};

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAiModelConfig();
      setForm((prev) => ({ ...prev, ...normalizeConfig(data) }));
    } catch (error) {
      console.error(error);
      toast.error(t.failedLoad);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleSave = async (e) => {
    e.preventDefault();

    if (Number(form.yolo_conf_threshold) < 0 || Number(form.yolo_conf_threshold) > 1) {
      toast.error("YOLO confidence must be between 0 and 1.");
      return;
    }

    setIsSaving(true);
    try {
      await updateAiModelConfig({
        ...form,
        yolo_conf_threshold: Number(form.yolo_conf_threshold),
        yolo_img_size: Number(form.yolo_img_size),
        res_img_size: Number(form.res_img_size),
        enabled: Boolean(form.enabled),
      });
      toast.success(t.saved);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.failedSave);
    } finally {
      setIsSaving(false);
    }
  };

  const Field = ({ label, field, type = "text", step, min, max }) => (
    <div>
      <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">
        {label}
      </label>
      <input
        type={type}
        step={step}
        min={min}
        max={max}
        value={form[field]}
        onChange={(e) =>
          setForm({
            ...form,
            [field]: type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
        className={`w-full h-12 px-4 rounded-xl border outline-none text-sm font-semibold ${inputClass}`}
      />
    </div>
  );

  return (
    <form onSubmit={handleSave} className="w-full max-w-[1200px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400 mb-2">
            Agent 1 ML/DL
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            {t.subtitle}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 ${cardClass} text-slate-700 dark:text-slate-300 disabled:opacity-60`}
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? t.saving : t.save}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className={`rounded-xl border shadow-sm p-6 space-y-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Cpu size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.modelPaths}</h2>
          </div>

          <Field label={t.yoloPath} field="yolo_model_path" />
          <Field label={t.resPath} field="res_model_path" />
          <Field label={t.classesPath} field="res_classes_path" />
        </div>

        <div className={`rounded-xl border shadow-sm p-6 space-y-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <SlidersHorizontal size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.parameters}</h2>
          </div>

          <button
            type="button"
            onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between gap-4 transition-colors ${
              form.enabled
                ? "border-teal-300 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-800"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <span className="font-black text-slate-900 dark:text-white">{t.enabled}</span>
            <div className={`w-11 h-6 rounded-full p-1 ${form.enabled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${form.enabled ? "translate-x-5" : ""}`} />
            </div>
          </button>

          <Field label={t.conf} field="yolo_conf_threshold" type="number" step="0.01" min="0" max="1" />
          <Field label={t.yoloSize} field="yolo_img_size" type="number" min="320" />
          <Field label={t.resSize} field="res_img_size" type="number" min="128" />

          <div>
            <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">
              {t.device}
            </label>
            <select
              value={form.device}
              onChange={(e) => setForm({ ...form, device: e.target.value })}
              className={`w-full h-12 px-4 rounded-xl border outline-none text-sm font-bold ${inputClass}`}
            >
              <option value="auto">Auto</option>
              <option value="cpu">CPU</option>
              <option value="cuda">CUDA</option>
            </select>
          </div>
        </div>
      </div>
    </form>
  );
}