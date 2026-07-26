import React, { useState, useRef } from "react";
import { UploadCloud as CloudUploadIcon, Loader2 } from "lucide-react";
import { exportBenchmarkMetrics } from "../../services/adminService";

const BenchmarkMetrics = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef();

  const handleFileChange = (e) => {
    setError("");
    setSuccess(false);
    const selected = e.target.files[0];
    if (selected) {
      if (
        !selected.name.endsWith(".xlsx") &&
        !selected.name.endsWith(".xls")
      ) {
        setError("Chỉ hỗ trợ file Excel (.xlsx, .xls).");
        setFile(null);
        return;
      }
      setFile(selected);
    }
  };

  const handleCalculate = async () => {
    if (!file) {
      setError("Vui lòng chọn file benchmark Excel trước.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const blob = await exportBenchmarkMetrics(file);
      
      // Handle download
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      
      const originalName = file.name.split('.').slice(0, -1).join('.');
      link.setAttribute("download", `${originalName}_simple_verified_metrics.xlsx`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setSuccess(true);
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(err);
      
      if (err.response && err.response.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          setError(json.message || json.detail || "Lỗi xử lý file Excel.");
        } catch (e) {
          setError("Lỗi xử lý file Excel hoặc file không đúng định dạng.");
        }
      } else {
        const msg = err.response?.data?.message || err.response?.data?.detail || err.message || "Lỗi không xác định";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Benchmark Metrics</h1>
      
      <p className="text-gray-500 mb-6">
        Upload file Benchmark chính thức để tính toán 4 chỉ số: Accuracy, Precision, Recall, F1-Score.
        Module tự động đối soát Accuracy giữa Official và Verification.
      </p>

      <div className="bg-white dark:bg-slate-900 rounded-lg shadow p-6 max-w-2xl">
        <div
          className="border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg p-8 text-center mb-6 cursor-pointer hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            hidden
            ref={fileInputRef}
            accept=".xlsx, .xls"
            onChange={handleFileChange}
          />
          <div className="flex justify-center mb-4">
            <CloudUploadIcon size={48} className="text-gray-400" />
          </div>
          <h3 className="text-xl font-medium mb-2">
            {file ? file.name : "Kéo thả hoặc click để chọn file Excel"}
          </h3>
          <p className="text-gray-500 text-sm">
            Hỗ trợ cấu trúc benchmark chuẩn: HeThong, GPT_GEMINI
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4 border border-red-200">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-50 text-green-700 p-4 rounded-md mb-4 border border-green-200">
            Tính toán thành công! File Excel đã được tải xuống.
          </div>
        )}

        <button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          onClick={handleCalculate}
          disabled={!file || loading}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" size={20} />
              Đang tính toán...
            </>
          ) : (
            "Calculate Metrics"
          )}
        </button>
      </div>
    </div>
  );
};

export default BenchmarkMetrics;
