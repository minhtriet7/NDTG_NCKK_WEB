import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileImage,
  FileSpreadsheet,
  Filter,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Square,
  UploadCloud,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  calculateMetricsFromExcel,
  exportAdminExperiments,
  getAdminExperiments,
  runAdminExperiment,
  stopAdminExperiment,
} from "../../services/adminService";
import { useAppStore } from "../../store/appStore";


const INITIAL_FORM = {
  dataset_id: "",
  image_id: "",
  ground_truth_country: "",
  ground_truth_currency: "",
  ground_truth_denomination: "",
  repeat_count: 1,
  delay_between_runs: 10,
  stop_on_rate_limit: true,
  stop_on_provider_error: true,
  force_rerun: false,
};

const INITIAL_FILTERS = {
  dataset_id: "",
  image_id: "",
  status: "",
  date_from: "",
  date_to: "",
};

const normalizeGroundTruthDenomination = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[,\s]+/g, "");

const REQUIRED_BENCHMARK_COLUMNS = [
  "file_name",
  "dataset_id",
  "image_id",
  "ground_truth_country",
  "ground_truth_currency",
  "ground_truth_denomination",
];

const RECOMMENDED_BENCHMARK_COLUMNS = [
  "source_group",
  "capture_group",
  "angle",
];

const normalizeCsvHeader = (value) =>
  String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const normalizeBenchmarkFileName = (value) =>
  String(value || "").trim().toLowerCase();

const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => String(value || "").trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => String(value || "").trim())) {
    rows.push(row);
  }

  return rows;
};

const parseBenchmarkCsv = (text) => {
  const rows = parseCsvRows(String(text || ""));
  if (!rows.length) {
    return {
      headers: [],
      totalRows: 0,
      validRows: [],
      missingRequired: REQUIRED_BENCHMARK_COLUMNS,
      missingRecommended: RECOMMENDED_BENCHMARK_COLUMNS,
      duplicateFileNames: [],
      duplicateLogicalIds: [],
    };
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const missingRequired = REQUIRED_BENCHMARK_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  const missingRecommended = RECOMMENDED_BENCHMARK_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  const parsedRows = rows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      if (header) {
        record[header] = String(values[index] ?? "").trim();
      }
      return record;
    }, {}),
  );
  const validRows = parsedRows.filter((record) =>
    REQUIRED_BENCHMARK_COLUMNS.every((column) => record[column]),
  );
  const fileNameCounts = validRows.reduce((counts, record) => {
    const key = normalizeBenchmarkFileName(record.file_name);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const logicalIdCounts = validRows.reduce((counts, record) => {
    const key = `${String(record.dataset_id || "").trim().toUpperCase()}/${String(
      record.image_id || "",
    )
      .trim()
      .toUpperCase()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

  return {
    headers,
    totalRows: parsedRows.length,
    validRows,
    missingRequired,
    missingRecommended,
    duplicateFileNames: [...fileNameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([fileName]) => fileName),
    duplicateLogicalIds: [...logicalIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([logicalId]) => logicalId),
  };
};

const STALE_RUN_MS = 30 * 60 * 1000;

const isStaleRun = (run) => {
  if (run?.is_stale != null) return Boolean(run.is_stale);
  if (!["queued", "running"].includes(String(run?.status || "").toLowerCase())) {
    return false;
  }
  const timestamp = run?.updated_at || run?.created_at;
  const parsed = timestamp ? new Date(timestamp).getTime() : Number.NaN;
  return Number.isFinite(parsed) && Date.now() - parsed >= STALE_RUN_MS;
};

const isActiveRun = (run) =>
  ["queued", "running"].includes(String(run?.status || "").toLowerCase()) &&
  !isStaleRun(run);

const statusTone = (status) => {
  const value = String(status || "").toLowerCase();
  if (value === "stale") {
    return "bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-300";
  }
  if (["completed", "completed_partial", "completed_with_limit"].includes(value)) {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300";
  }
  if (value === "completed_with_warning") {
    return "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300";
  }
  if (["queued", "waiting"].includes(value)) {
    return "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300";
  }
  if (value === "running") {
    return "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-300";
  }
  if (
    ["no_banknote_detected", "needs review", "needs_review", "needs_better_image"].includes(
      value,
    )
  ) {
    return "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300";
  }
  if (["skipped", "disabled", "not_completed"].includes(value)) {
    return "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400";
  }
  if (
    ["failed", "technical_error", "agent_error", "error"].some((item) =>
      value.includes(item),
    )
  ) {
    return "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300";
  }
  return "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300";
};

const StatusBadge = ({ value }) => (
  <span
    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(
      value,
    )}`}
  >
    {value || "—"}
  </span>
);

const CorrectIcon = ({ value }) =>
  value ? (
    <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
  ) : (
    <XCircle className="mx-auto h-4 w-4 text-rose-500" />
  );

const issueSeverity = (run) => {
  if (run?.issue_severity) return run.issue_severity;
  const types = [
    run?.issue_type,
    run?.error_type,
    ...Object.values(run?.agent_errors || {}).map((item) => item?.error_type),
  ].filter(Boolean);
  if (types.some((type) => ["partial_result", "no_banknote_detected"].includes(type))) {
    return "warning";
  }
  return types.length ? "error" : null;
};

const hasRunError = (run) =>
  Boolean(
    run?.issue_message ||
    run?.error_message ||
      (run?.agent_errors && Object.keys(run.agent_errors).length),
  );

const fieldCorrectCount = (run) =>
  run?.field_correct_count ?? run?.correct_count ?? 0;

const fieldTotal = (run) => run?.field_total ?? 3;

const fieldScorePct = (run) =>
  run?.field_score_pct ?? run?.score_pct ?? 0;

const completedAgentCount = (run) => {
  if (run?.completed_agent_count != null) return run.completed_agent_count;
  if (run?.valid_agent_count != null) return run.valid_agent_count;
  return [run?.ag1_status, run?.ag2_status, run?.ag3_status].filter(
    (status) =>
      ["completed", "complete", "success", "succeeded"].includes(
        String(status || "").trim().toLowerCase(),
      ),
  ).length;
};

const validVoteCount = (run) => run?.valid_vote_count ?? null;
const maxMatchingVotes = (run) => run?.max_matching_votes ?? null;
const requiredVotes = (run) => run?.required_votes ?? null;
const consensusReached = (run) =>
  run?.consensus_reached == null ? null : Boolean(run.consensus_reached);
const metricValue = (value, total, missingLabel = "Not available") =>
  value == null ? missingLabel : total == null ? String(value) : `${value}/${total}`;

const agentTotal = (run) => run?.agent_total ?? 3;

const pipelineStatus = (run) => run?.pipeline_status || run?.status || "—";
const displayedStatus = (run) => (isStaleRun(run) ? "stale" : pipelineStatus(run));

const experimentAgentRows = (run) => [
  {
    key: "ag0",
    label: "AG0",
    status: run?.ag0_status,
    error: run?.agent_errors?.ag0,
  },
  {
    key: "ag1",
    label: "AG1",
    status: run?.ag1_status,
    model: run?.ag1_model,
    error: run?.agent_errors?.ag1,
  },
  {
    key: "ag2",
    label: "AG2",
    status: run?.ag2_status,
    model: run?.ag2_model,
    error: run?.agent_errors?.ag2,
  },
  {
    key: "ag3",
    label: "AG3",
    status: run?.ag3_status,
    model: run?.ag3_provider,
    error: run?.agent_errors?.ag3,
  },
  {
    key: "ag4",
    label: "AG4",
    status: run?.ag4_status,
    model: run?.ag4_model,
    error: run?.agent_errors?.ag4,
  },
];

export default function Experiments() {
  const lang = useAppStore((state) => state.lang || "EN");
  const vi = lang === "VI";
  const [form, setForm] = useState(INITIAL_FORM);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentRuns, setCurrentRuns] = useState([]);
  const [activeExperimentId, setActiveExperimentId] = useState("");
  const [benchmarkLookup, setBenchmarkLookup] = useState(() => new Map());
  const [benchmarkInfo, setBenchmarkInfo] = useState(null);
  const [benchmarkError, setBenchmarkError] = useState("");
  const [matchedBenchmark, setMatchedBenchmark] = useState(null);
  const [benchmarkMatchStatus, setBenchmarkMatchStatus] = useState("idle");
  const [selectedErrorRun, setSelectedErrorRun] = useState(null);
  const [runError, setRunError] = useState("");
  const [calculatingMetrics, setCalculatingMetrics] = useState(false);
  const metricsInputRef = useRef(null);

  const t = useMemo(
    () => ({
      title: vi ? "Thực nghiệm nhận diện" : "Recognition Experiments",
      subtitle: vi
        ? "Chạy lặp pipeline AG0–AG4, đối chiếu ground truth và lưu riêng khỏi lịch sử nhận diện thật."
        : "Repeat the AG0–AG4 pipeline, compare with ground truth, and keep results separate from real recognition history.",
      isolated: vi
        ? "Không trừ token user · Không ghi recognition_requests/tasks"
        : "No user token charge · No recognition_requests/tasks",
      upload: vi ? "Ảnh thực nghiệm" : "Experiment image",
      choose: vi ? "Chọn ảnh" : "Choose image",
      dataset: "Dataset ID",
      image: "Image ID",
      country: vi ? "Quốc gia ground truth" : "Ground-truth country",
      currency: vi ? "Tiền tệ ground truth" : "Ground-truth currency",
      denomination: vi ? "Mệnh giá ground truth" : "Ground-truth denomination",
      repeat: vi ? "Số lần chạy" : "Repeat count",
      run: vi ? "Chạy thực nghiệm" : "Run Experiment",
      starting: vi ? "Đang khởi tạo..." : "Starting...",
      progress: vi ? "Tiến trình thực nghiệm" : "Experiment progress",
      completedRuns: vi ? "lượt đã kết thúc" : "runs finished",
      errors: vi ? "Lỗi được ghi nhận" : "Recorded errors",
      results: vi ? "Kết quả từng lượt" : "Run results",
      history: vi ? "Lịch sử thực nghiệm" : "Experiment history",
      refresh: vi ? "Làm mới" : "Refresh",
      export: vi ? "Xuất Excel" : "Export Excel",
      apply: vi ? "Lọc dữ liệu" : "Apply filters",
      clear: vi ? "Xóa lọc" : "Clear",
      allStatus: vi ? "Tất cả trạng thái" : "All statuses",
      noData: vi ? "Chưa có dữ liệu thực nghiệm." : "No experiment data yet.",
      required: vi
        ? "Vui lòng nhập đủ thông tin và chọn ảnh."
        : "Please complete all fields and choose an image.",
      queued: vi
        ? "Đã tạo thực nghiệm. Pipeline đang chạy tuần tự."
        : "Experiment created. The pipeline is running sequentially.",
      runNo: vi ? "Lượt" : "Run",
      prediction: vi ? "Dự đoán" : "Prediction",
      score: vi ? "Độ chính xác trường" : "Field accuracy",
      agentVotes: vi ? "Agent hoàn thành" : "Completed agents",
      validVotes: vi ? "Phiếu hợp lệ" : "Valid votes",
      maximumAgreement: vi ? "Đồng thuận cao nhất" : "Maximum agreement",
      requiredVotes: vi ? "Phiếu cần" : "Required votes",
      consensus: vi ? "Đồng thuận" : "Consensus",
      consensusPassed: vi ? "Đạt" : "Passed",
      consensusFailed: vi ? "Không đạt" : "Failed",
      notAvailable: vi ? "Chưa có" : "Not available",
      pipelineStatus: vi ? "Trạng thái pipeline" : "Pipeline status",
      issues: vi ? "Vấn đề" : "Issues",
      exact: "Exact match",
      duration: vi ? "Thời gian" : "Duration",
      status: vi ? "Trạng thái" : "Status",
      error: vi ? "Lỗi" : "Error",
      loadBenchmark: vi ? "Tải Benchmark CSV" : "Load Benchmark CSV",
      benchmarkLoaded: vi ? "Benchmark đã tải" : "Loaded benchmark",
      totalRows: vi ? "Tổng số dòng" : "Total rows",
      validRows: vi ? "Dòng hợp lệ" : "Valid rows",
      invalidRows: vi ? "Dòng không hợp lệ" : "Invalid rows",
      missingColumns: vi ? "Thiếu cột bắt buộc" : "Missing required columns",
      missingRecommended: vi ? "Thiếu cột khuyến nghị" : "Missing recommended columns",
      duplicateFiles: vi ? "Tên file bị trùng" : "Duplicate file names",
      duplicateLogicalIds: vi
        ? "ID logic bị trùng"
        : "Duplicate logical IDs",
      duplicateLogicalFound: vi
        ? "Phát hiện ID logic bị trùng"
        : "Duplicate logical ID found",
      benchmarkReady: vi
        ? "Benchmark CSV đã sẵn sàng để tự động điền."
        : "Benchmark CSV is ready for auto-fill.",
      benchmarkMatched: vi
        ? "Đã tìm thấy metadata benchmark và tự động điền form."
        : "Benchmark metadata found and the form was auto-filled.",
      benchmarkNotFound: vi
        ? "Không tìm thấy metadata benchmark cho file ảnh này. Vui lòng nhập ground truth thủ công."
        : "No benchmark metadata found for this image file. Please enter ground truth manually.",
      invalidCsv: vi
        ? "CSV không hợp lệ hoặc không có dữ liệu."
        : "The CSV is invalid or contains no data.",
      sourceGroup: vi ? "Nhóm nguồn" : "Source group",
      captureGroup: vi ? "Nhóm chụp" : "Capture group",
      angle: vi ? "Góc ảnh" : "Angle",
      delay: vi ? "Độ trễ giữa các lượt" : "Delay between runs",
      seconds: vi ? "giây" : "seconds",
      stopRateLimit: vi ? "Dừng khi gặp giới hạn API" : "Stop on rate limit",
      stopProviderError: vi
        ? "Dừng khi lỗi provider/cấu hình"
        : "Stop on provider/config error",
      stopRemaining: vi ? "Dừng các lượt còn lại" : "Stop remaining runs",
      stoppingRuns: vi ? "Đang dừng..." : "Stopping...",
      stoppedRuns: vi
        ? "Đã dừng các lượt chưa bắt đầu. Lượt đang chạy sẽ hoàn tất."
        : "Queued runs were stopped. The active run may finish.",
      forceRerun: vi ? "Bắt buộc chạy lại" : "Force rerun",
      recommended: vi
        ? "Khuyến nghị: chạy repeat=1 cho toàn bộ ảnh trước. Chỉ dùng repeat=3 cho ảnh lỗi, không ổn định hoặc quan trọng."
        : "Recommended: run repeat=1 for all images first. Use repeat=3 only for failed, unstable, or important images.",
      rateLimitStopped: vi
        ? "Đã phát hiện giới hạn API. Thực nghiệm đã dừng để bảo vệ quota của provider."
        : "Rate limit detected. Experiment stopped to protect provider quota.",
      providerErrorStopped: vi
        ? "Thực nghiệm đã dừng sau lỗi provider hoặc cấu hình."
        : "Experiment stopped after a provider or configuration error.",
      viewError: vi ? "Xem lỗi" : "View error",
      viewWarning: vi ? "Xem cảnh báo" : "View warning",
      errorDetails: vi ? "Chi tiết lỗi" : "Error Details",
      issueDetails: vi ? "Chi tiết vấn đề" : "Issue Details",
      severity: vi ? "Mức độ" : "Severity",
      failedStage: vi ? "Giai đoạn lỗi" : "Failed stage",
      provider: "Provider",
      httpStatus: "HTTP status",
      retryAfter: "Retry after",
      rawExcerpt: vi ? "Trích đoạn phản hồi" : "Raw excerpt",
      copyIssue: vi ? "Sao chép chi tiết lỗi" : "Copy issue details",
      copiedIssue: vi ? "Đã sao chép chi tiết lỗi." : "Issue details copied.",
      failedStages: vi ? "Các giai đoạn lỗi" : "Failed stages",
      warningStages: vi ? "Các giai đoạn cảnh báo" : "Warning stages",
      createdAt: vi ? "Thời điểm tạo" : "Created at",
      staleWarning: vi
        ? "Lượt chạy này có thể đã bị kẹt vì máy chủ đã khởi động lại."
        : "This run may be stale because the server may have restarted.",
      modelTrace: vi ? "Model/provider thực nghiệm" : "Experiment model/provider",
      ag1Model: "AG1 model",
      ag2Model: "AG2 model",
      ag3Provider: "AG3 provider",
      ag4Model: "AG4 model",
      close: vi ? "Đóng" : "Close",
      cannotRun: vi ? "Chưa thể chạy thực nghiệm:" : "Cannot run experiment yet:",
      missingImageFile: vi ? "Thiếu file ảnh" : "Missing image file",
      previewWithoutFile: vi
        ? "Có ảnh xem trước nhưng chưa đính kèm file. Vui lòng chọn lại ảnh."
        : "Image preview is available, but no file is attached. Please re-select the image.",
      missingDatasetId: vi ? "Thiếu Dataset ID" : "Missing Dataset ID",
      missingImageId: vi ? "Thiếu Image ID" : "Missing Image ID",
      missingCountry: vi ? "Thiếu quốc gia ground truth" : "Missing ground-truth country",
      missingCurrency: vi ? "Thiếu tiền tệ ground truth" : "Missing ground-truth currency",
      missingDenomination: vi ? "Thiếu mệnh giá ground truth" : "Missing ground-truth denomination",
      invalidDenomination: vi
        ? "Mệnh giá ground truth phải là một số hợp lệ lớn hơn 0"
        : "Ground-truth denomination must be a valid number greater than 0",
      activeRunBlocksStart: vi
        ? "Một thực nghiệm khác đang chạy. Hãy chờ lượt hiện tại kết thúc."
        : "Another experiment is running. Wait for the active run to finish.",
      readyToRun: vi
        ? "Đã sẵn sàng. Nhấn Chạy thực nghiệm để bắt đầu AG0–AG4."
        : "Ready to run. Click Run Experiment to start AG0–AG4.",
      noExperimentStarted: vi
        ? "Chưa có thực nghiệm nào được bắt đầu. Chọn ảnh, kiểm tra ground truth rồi nhấn Chạy thực nghiệm."
        : "No experiment has started yet. Select an image, verify ground truth, then click Run Experiment.",
      waitingForRuns: vi
        ? "Yêu cầu đã được tiếp nhận. Đang chờ dữ liệu lượt chạy từ máy chủ."
        : "The request was accepted. Waiting for run data from the server.",
      missingExperimentId: vi
        ? "Máy chủ không trả về mã thực nghiệm. Vui lòng thử lại."
        : "The server did not return an experiment ID. Please try again.",
      pollingFailed: vi
        ? "Không thể cập nhật tiến trình thực nghiệm. Kiểm tra kết nối backend rồi thử làm mới."
        : "Could not update experiment progress. Check the backend connection and refresh.",
    }),
    [vi],
  );

  const normalizedDenomination = normalizeGroundTruthDenomination(
    form.ground_truth_denomination,
  );
  const validationIssues = useMemo(() => {
    const issues = [];
    if (!selectedFile) {
      issues.push(previewUrl ? t.previewWithoutFile : t.missingImageFile);
    }
    if (!String(form.dataset_id || "").trim()) issues.push(t.missingDatasetId);
    if (!String(form.image_id || "").trim()) issues.push(t.missingImageId);
    if (!String(form.ground_truth_country || "").trim()) {
      issues.push(t.missingCountry);
    }
    if (!String(form.ground_truth_currency || "").trim()) {
      issues.push(t.missingCurrency);
    }
    if (!normalizedDenomination) {
      issues.push(t.missingDenomination);
    } else if (
      !/^\d+(?:\.\d+)?$/.test(normalizedDenomination) ||
      Number(normalizedDenomination) <= 0
    ) {
      issues.push(t.invalidDenomination);
    }
    return issues;
  }, [form, normalizedDenomination, previewUrl, selectedFile, t]);
  const runBlockers = activeExperimentId
    ? [...validationIssues, t.activeRunBlocksStart]
    : validationIssues;
  const isReadyToRun = validationIssues.length === 0 && !activeExperimentId;

  const cleanParams = useCallback((source) => {
    const params = {};
    Object.entries(source).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        if (key === "date_from") {
          params[key] = `${value}T00:00:00`;
        } else if (key === "date_to") {
          params[key] = `${value}T23:59:59`;
        } else {
          params[key] = value;
        }
      }
    });
    return params;
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAdminExperiments(cleanParams(filters));
      setHistory(response?.items || []);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          (vi
            ? "Không thể tải lịch sử thực nghiệm."
            : "Could not load experiment history."),
      );
    } finally {
      setLoading(false);
    }
  }, [cleanParams, filters, vi]);

  const pollCurrentExperiment = useCallback(async () => {
    if (!activeExperimentId) return;
    try {
      const response = await getAdminExperiments({
        experiment_id: activeExperimentId,
        limit: 3,
      });
      const runs = [...(response?.items || [])].sort((a, b) => a.run_no - b.run_no);
      setCurrentRuns(runs);
      setRunError("");
      if (runs.length && runs.every((run) => !isActiveRun(run))) {
        setActiveExperimentId("");
        await loadHistory();
        if (
          runs.some(
            (run) =>
              run.error_type === "rate_limit" ||
              run.status === "stopped_rate_limit",
          )
        ) {
          toast.error(
            vi
              ? "Đã phát hiện giới hạn API. Thực nghiệm đã dừng để bảo vệ quota."
              : "Rate limit detected. Experiment stopped to protect provider quota.",
          );
        } else if (runs.some((run) => run.status === "stopped_provider_error")) {
          toast.error(
            vi
              ? "Thực nghiệm đã dừng sau lỗi provider hoặc cấu hình."
              : "Experiment stopped after a provider or configuration error.",
          );
        } else {
          toast.success(vi ? "Thực nghiệm đã hoàn tất." : "Experiment completed.");
        }
      }
    } catch (error) {
      console.error("Experiment polling failed:", error);
      setRunError(
        error?.response?.data?.detail || error?.message || t.pollingFailed,
      );
    }
  }, [activeExperimentId, loadHistory, t.pollingFailed, vi]);

  useEffect(() => {
    const timer = window.setTimeout(loadHistory, 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeExperimentId) return undefined;
    const initialTimer = window.setTimeout(pollCurrentExperiment, 0);
    const timer = window.setInterval(pollCurrentExperiment, 2000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [activeExperimentId, pollCurrentExperiment]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const applyBenchmarkMetadata = useCallback(
    (fileName, lookup, clearPreviousAutoFill = false) => {
      if (!lookup?.size) {
        setMatchedBenchmark(null);
        setBenchmarkMatchStatus("idle");
        return;
      }

      const match = lookup.get(normalizeBenchmarkFileName(fileName));
      if (!match) {
        setMatchedBenchmark(null);
        setBenchmarkMatchStatus("not_found");
        if (clearPreviousAutoFill) {
          setForm((current) => ({
            ...current,
            dataset_id: "",
            image_id: "",
            ground_truth_country: "",
            ground_truth_currency: "",
            ground_truth_denomination: "",
          }));
        }
        return;
      }

      setMatchedBenchmark(match);
      setBenchmarkMatchStatus("matched");
      setForm((current) => ({
        ...current,
        dataset_id: match.dataset_id,
        image_id: match.image_id,
        ground_truth_country: match.ground_truth_country,
        ground_truth_currency: match.ground_truth_currency,
        ground_truth_denomination: match.ground_truth_denomination,
      }));
    },
    [],
  );

  const handleBenchmarkCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = parseBenchmarkCsv(await file.text());
      if (parsed.missingRequired.length) {
        const message = `${t.missingColumns}: ${parsed.missingRequired.join(", ")}`;
        setBenchmarkError(message);
        toast.error(message);
        return;
      }
      if (!parsed.totalRows) {
        setBenchmarkError(t.invalidCsv);
        toast.error(t.invalidCsv);
        return;
      }

      const lookup = new Map();
      parsed.validRows.forEach((record) => {
        const key = normalizeBenchmarkFileName(record.file_name);
        if (!lookup.has(key)) {
          lookup.set(key, record);
        }
      });

      setBenchmarkLookup(lookup);
      setBenchmarkInfo({
        fileName: file.name,
        totalRows: parsed.totalRows,
        validRows: parsed.validRows.length,
        invalidRows: parsed.totalRows - parsed.validRows.length,
        missingRecommended: parsed.missingRecommended,
        duplicateFileNames: parsed.duplicateFileNames,
        duplicateLogicalIds: parsed.duplicateLogicalIds,
      });
      setBenchmarkError("");

      if (selectedFile) {
        applyBenchmarkMetadata(
          selectedFile.name,
          lookup,
          Boolean(matchedBenchmark),
        );
      } else {
        setMatchedBenchmark(null);
        setBenchmarkMatchStatus("idle");
      }
      toast.success(t.benchmarkReady);
    } catch (error) {
      console.error("Benchmark CSV parsing failed:", error);
      setBenchmarkError(t.invalidCsv);
      toast.error(t.invalidCsv);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(vi ? "Chỉ chấp nhận file ảnh." : "Only image files are accepted.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRunError("");
    applyBenchmarkMetadata(
      file.name,
      benchmarkLookup,
      Boolean(matchedBenchmark),
    );
  };

  const handleRun = async (event) => {
    event.preventDefault();
    if (activeExperimentId) {
      toast.error(t.activeRunBlocksStart);
      return;
    }
    if (validationIssues.length) {
      toast.error(`${t.cannotRun} ${validationIssues.join("; ")}`);
      return;
    }

    const payload = new FormData();
    payload.append("file", selectedFile);
    const normalizedForm = {
      ...form,
      dataset_id: String(form.dataset_id).trim(),
      image_id: String(form.image_id).trim(),
      ground_truth_country: String(form.ground_truth_country).trim(),
      ground_truth_currency: String(form.ground_truth_currency).trim().toUpperCase(),
      ground_truth_denomination: normalizedDenomination,
    };
    Object.entries(normalizedForm).forEach(([key, value]) =>
      payload.append(key, value),
    );

    setSubmitting(true);
    setRunError("");
    try {
      const response = await runAdminExperiment(payload);
      if (!response?.experiment_id) {
        throw new Error(t.missingExperimentId);
      }
      setActiveExperimentId(response.experiment_id);
      setCurrentRuns(
        [...(response.runs || [])].sort((a, b) => a.run_no - b.run_no),
      );
      toast.success(t.queued);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const detailMessage = Array.isArray(detail)
        ? detail.map((item) => item?.msg).filter(Boolean).join("; ")
        : typeof detail === "string"
          ? detail
          : detail?.message;
      const message =
        error?.response?.data?.message ||
        detailMessage ||
        error?.message ||
        (vi ? "Không thể chạy thực nghiệm." : "Could not start experiment.");
      setRunError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { status: ignoredStatus, ...exportFilters } = filters;
      void ignoredStatus;
      const blob = await exportAdminExperiments(cleanParams(exportFilters));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `banknote_experiments_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          (vi ? "Không thể xuất Excel." : "Could not export Excel."),
      );
    } finally {
      setExporting(false);
    }
  };

  const handleCalculateMetrics = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // Reset input so same file can be selected again
    if (!file) return;

    if (!file.name.toLowerCase().match(/\.(xlsx|xls)$/)) {
      toast.error(vi ? "Chỉ chấp nhận file .xlsx hoặc .xls" : "Only .xlsx or .xls files are accepted");
      return;
    }

    setCalculatingMetrics(true);
    try {
      const blob = await calculateMetricsFromExcel(file);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      link.download = `${originalName}_metrics_${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(vi ? "Đã xuất file metrics thành công" : "Metrics exported successfully");
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.detail ||
          error?.message ||
          (vi ? "Không thể tính metrics." : "Could not calculate metrics."),
      );
    } finally {
      setCalculatingMetrics(false);
    }
  };

  const handleStopRemaining = async () => {
    if (!activeExperimentId || stopping) return;
    setStopping(true);
    try {
      await stopAdminExperiment(activeExperimentId);
      toast.success(t.stoppedRuns);
      await pollCurrentExperiment();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          error?.message ||
          (vi ? "Không thể dừng các lượt còn lại." : "Could not stop remaining runs."),
      );
    } finally {
      setStopping(false);
    }
  };

  const copyIssueDetails = async () => {
    if (!selectedErrorRun) return;
    const agents = experimentAgentRows(selectedErrorRun);
    const issueAgents = agents.filter((agent) => agent.error);
    const failedStages = issueAgents
      .filter((agent) => agent.error?.severity === "error")
      .map((agent) => agent.label);
    const warningStages = issueAgents
      .filter((agent) => agent.error?.severity === "warning")
      .map((agent) => agent.label);
    const lines = [
      `${selectedErrorRun.dataset_id}/${selectedErrorRun.image_id} · Run ${selectedErrorRun.run_no}/${selectedErrorRun.repeat_count}`,
      `Field accuracy: ${fieldCorrectCount(selectedErrorRun)}/${fieldTotal(selectedErrorRun)}`,
      `Completed agents: ${completedAgentCount(selectedErrorRun)}/${agentTotal(selectedErrorRun)}`,
      `Valid votes: ${metricValue(validVoteCount(selectedErrorRun), agentTotal(selectedErrorRun))}`,
      `Maximum agreement: ${metricValue(maxMatchingVotes(selectedErrorRun), agentTotal(selectedErrorRun))}`,
      `Required votes: ${metricValue(requiredVotes(selectedErrorRun))}`,
      `Consensus: ${
        consensusReached(selectedErrorRun) == null
          ? "Not available"
          : consensusReached(selectedErrorRun)
            ? "Passed"
            : "Failed"
      }`,
      `Pipeline status: ${pipelineStatus(selectedErrorRun)}`,
      `Severity: ${issueSeverity(selectedErrorRun)}`,
      `Failed stages: ${failedStages.join(", ") || "—"}`,
      `Warnings: ${warningStages.join(", ") || "—"}`,
      "",
      ...issueAgents.flatMap((agent) => [
        `${agent.label} · ${agent.status || "unknown"} · ${agent.error.error_type || "unknown_error"}`,
        `Provider/model: ${agent.error.provider || agent.model || "—"}`,
        `Message: ${agent.error.error_message || "—"}`,
        "",
      ]),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success(t.copiedIssue);
  };

  const finishedCount = currentRuns.filter(
    (run) => !isActiveRun(run),
  ).length;
  const progressPct = currentRuns.length
    ? Math.round((finishedCount / currentRuns.length) * 100)
    : 0;
  const displayedRows = currentRuns.length ? currentRuns : history;
  const recordedErrors = currentRuns.filter(hasRunError);
  const recordedIssuesHaveError = recordedErrors.some(
    (run) => issueSeverity(run) === "error",
  );
  const rateLimitStopped = currentRuns.some(
    (run) =>
      run.error_type === "rate_limit" || run.status === "stopped_rate_limit",
  );
  const providerStopped = currentRuns.some(
    (run) => run.status === "stopped_provider_error",
  );
  const canStopRemaining = Boolean(
    activeExperimentId && currentRuns.some((run) => run.status === "queued"),
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-teal-500/15 via-cyan-500/10 to-violet-500/10 p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-teal-500/25 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                <FlaskConical className="h-4 w-4" /> ADMIN RESEARCH TOOL
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl dark:text-white">
                {t.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                {t.subtitle}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-2 inline h-4 w-4" />
              {t.isolated}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={handleRun}
          className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                  <FileSpreadsheet className="h-5 w-5 text-cyan-500" />
                  Benchmark CSV
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {vi
                    ? "Mapping tên file ảnh với dataset, image ID và ground truth."
                    : "Map image file names to dataset, image ID, and ground truth."}
                </p>
              </div>
              <label className="cursor-pointer rounded-xl bg-cyan-600 px-3.5 py-2 text-sm font-black text-white transition hover:bg-cyan-500">
                {t.loadBenchmark}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBenchmarkCsv}
                  className="hidden"
                />
              </label>
            </div>

            {benchmarkInfo && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/60">
                  <p className="truncate text-xs font-black text-slate-900 dark:text-white">
                    {t.benchmarkLoaded}: {benchmarkInfo.fileName}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {[
                      [t.totalRows, benchmarkInfo.totalRows],
                      [t.validRows, benchmarkInfo.validRows],
                      [t.invalidRows, benchmarkInfo.invalidRows],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-900"
                      >
                        <p className="text-base font-black text-slate-900 dark:text-white">
                          {value}
                        </p>
                        <p className="text-[10px] text-slate-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {benchmarkInfo.missingRecommended.length > 0 && (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mr-1 inline h-4 w-4" />
                    {t.missingRecommended}:{" "}
                    {benchmarkInfo.missingRecommended.join(", ")}
                  </p>
                )}
                {benchmarkInfo.duplicateFileNames.length > 0 && (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mr-1 inline h-4 w-4" />
                    {t.duplicateFiles}:{" "}
                    {benchmarkInfo.duplicateFileNames.slice(0, 5).join(", ")}
                    {benchmarkInfo.duplicateFileNames.length > 5 ? "…" : ""}
                  </p>
                )}
                {benchmarkInfo.duplicateLogicalIds.length > 0 && (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mr-1 inline h-4 w-4" />
                    {t.duplicateLogicalIds}:{" "}
                    {benchmarkInfo.duplicateLogicalIds
                      .slice(0, 8)
                      .map((logicalId) => `${t.duplicateLogicalFound}: ${logicalId}`)
                      .join("; ")}
                    {benchmarkInfo.duplicateLogicalIds.length > 8 ? "…" : ""}
                  </p>
                )}
              </div>
            )}

            {benchmarkError && (
              <p className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-bold text-rose-700 dark:text-rose-300">
                <XCircle className="mr-1 inline h-4 w-4" />
                {benchmarkError}
              </p>
            )}
          </div>

          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
              <UploadCloud className="h-5 w-5 text-teal-500" />
              {t.upload}
            </h2>
            <label className="mt-4 block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-teal-500 dark:border-slate-700 dark:bg-slate-950/50">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-52 w-full object-contain"
                />
              ) : (
                <div className="flex h-52 flex-col items-center justify-center gap-3 text-slate-500">
                  <FileImage className="h-10 w-10" />
                  <span className="text-sm font-bold">{t.choose}</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            {selectedFile && (
              <p className="mt-2 truncate text-xs text-slate-500">
                {selectedFile.name}
              </p>
            )}
            {selectedFile && benchmarkMatchStatus === "matched" && (
              <p className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                {t.benchmarkMatched}
              </p>
            )}
            {selectedFile && benchmarkMatchStatus === "not_found" && (
              <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-bold text-amber-700 dark:text-amber-300">
                <AlertCircle className="mr-1 inline h-4 w-4" />
                {t.benchmarkNotFound}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            {[
              ["dataset_id", t.dataset],
              ["image_id", t.image],
              ["ground_truth_country", t.country],
              ["ground_truth_currency", t.currency],
              ["ground_truth_denomination", t.denomination],
            ].map(([name, label]) => (
              <label key={name} className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                  {label}
                </span>
                <input
                  value={form[name]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [name]: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </label>
            ))}
          </div>

          {matchedBenchmark && (
            <div className="grid grid-cols-3 gap-2">
              {[
                [t.sourceGroup, matchedBenchmark.source_group],
                [t.captureGroup, matchedBenchmark.capture_group],
                [t.angle, matchedBenchmark.angle],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60"
                >
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-xs font-bold text-slate-900 dark:text-white">
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div>
            <span className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-400">
              {t.repeat}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      repeat_count: count,
                    }))
                  }
                  className={`rounded-xl border py-2.5 text-sm font-black transition ${
                    Number(form.repeat_count) === count
                      ? "border-teal-500 bg-teal-500 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
              {t.delay}
            </span>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="60"
                value={form.delay_between_runs}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    delay_between_runs: Math.max(
                      0,
                      Math.min(60, Number(event.target.value) || 0),
                    ),
                  }))
                }
                className="w-28 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <span className="text-xs text-slate-500">{t.seconds} (0–60)</span>
            </div>
          </label>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            {[
              ["stop_on_rate_limit", t.stopRateLimit],
              ["stop_on_provider_error", t.stopProviderError],
              ["force_rerun", t.forceRerun],
            ].map(([name, label]) => (
              <label
                key={name}
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {label}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(form[name])}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [name]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-teal-500"
                />
              </label>
            ))}
          </div>

          <p className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs leading-5 text-violet-700 dark:text-violet-300">
            {t.recommended}
          </p>

          <button
            type="submit"
            disabled={submitting || runBlockers.length > 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-teal-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {submitting ? t.starting : t.run}
          </button>

          {runBlockers.length > 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <p className="font-black">{t.cannotRun}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {runBlockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              {t.readyToRun}
            </p>
          )}

          {runError && (
            <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-bold text-rose-700 dark:text-rose-300">
              <XCircle className="mr-1 inline h-4 w-4" />
              {runError}
            </p>
          )}
        </form>

        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">
                {t.progress}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {currentRuns.length
                  ? `${finishedCount}/${currentRuns.length} ${t.completedRuns}`
                  : activeExperimentId
                    ? t.waitingForRuns
                    : isReadyToRun
                      ? t.readyToRun
                      : t.noExperimentStarted}
              </p>
            </div>
            {activeExperimentId && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  value={vi ? "Đang chạy tuần tự" : "Sequential run active"}
                />
                {currentRuns.length > 1 && (
                  <button
                    type="button"
                    onClick={handleStopRemaining}
                    disabled={!canStopRemaining || stopping}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
                  >
                    {stopping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {stopping ? t.stoppingRuns : t.stopRemaining}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {currentRuns.length ? (
            <div className="space-y-3">
              {currentRuns.map((run) => (
                <article
                  key={run.id || run.run_no}
                  className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-black text-slate-900 dark:text-white">
                      {isActiveRun(run) ? (
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                      {t.runNo} {run.run_no}/{run.repeat_count}
                    </div>
                    <StatusBadge value={isStaleRun(run) ? "stale" : run.status} />
                  </div>
                  {isStaleRun(run) && (
                    <p className="mb-3 rounded-xl border border-orange-500/25 bg-orange-500/10 p-3 text-xs font-bold text-orange-700 dark:text-orange-300">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      {t.staleWarning}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {experimentAgentRows(run).map((agent) => (
                      <div
                        key={agent.key}
                        className={`rounded-xl border p-3 ${
                          agent.error
                            ? agent.error.severity === "warning"
                              ? "border-amber-500/25 bg-amber-500/5"
                              : "border-rose-500/25 bg-rose-500/5"
                            : "border-transparent bg-slate-50 dark:bg-slate-950/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black text-slate-500">
                            {agent.label}
                          </p>
                          <StatusBadge value={agent.status} />
                        </div>
                        {agent.model && (
                          <p className="mt-2 break-all text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            {agent.model}
                          </p>
                        )}
                        {agent.error && (
                          <p
                            className={`mt-2 truncate text-[11px] font-black ${
                              agent.error.severity === "warning"
                                ? "text-amber-700 dark:text-amber-300"
                                : "text-rose-700 dark:text-rose-300"
                            }`}
                            title={agent.error.error_message || agent.error.error_type}
                          >
                            {agent.label} {agent.status || "Failed"} ·{" "}
                            {agent.error.error_type || "unknown_error"}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {hasRunError(run) && (
                    <button
                      type="button"
                      onClick={() => setSelectedErrorRun(run)}
                      className={`mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${
                        issueSeverity(run) === "warning"
                          ? "border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                          : "border-rose-500/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
                      }`}
                    >
                      <AlertCircle className="h-4 w-4" />
                      {issueSeverity(run) === "warning"
                        ? t.viewWarning
                        : t.viewError}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 dark:border-slate-700">
              <Clock3 className="mb-3 h-9 w-9" />
              <p className="max-w-sm text-sm">
                {activeExperimentId
                  ? t.waitingForRuns
                  : isReadyToRun
                    ? t.readyToRun
                    : t.noExperimentStarted}
              </p>
            </div>
          )}

          {rateLimitStopped && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-800 dark:text-amber-300">
              <AlertCircle className="mr-2 inline h-5 w-5" />
              {t.rateLimitStopped}
            </div>
          )}
          {providerStopped && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-800 dark:text-rose-300">
              <AlertCircle className="mr-2 inline h-5 w-5" />
              {t.providerErrorStopped}
            </div>
          )}

          {recordedErrors.length > 0 && (
            <div
              className={`rounded-2xl border p-4 ${
                recordedIssuesHaveError
                  ? "border-rose-500/25 bg-rose-500/5"
                  : "border-amber-500/25 bg-amber-500/5"
              }`}
            >
              <h3
                className={`mb-2 flex items-center gap-2 text-sm font-black ${
                  recordedIssuesHaveError
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                <AlertCircle className="h-4 w-4" /> {t.issues}
              </h3>
              {recordedErrors.map((run) => (
                <p
                  key={run.id}
                  className={`mt-1 text-xs ${
                    issueSeverity(run) === "warning"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-rose-700 dark:text-rose-300"
                  }`}
                >
                  #{run.run_no} · {run.issue_stage || run.error_stage || "pipeline"} ·{" "}
                  {issueSeverity(run)}:{" "}
                  {run.issue_message ||
                    run.error_message ||
                    Object.values(run.agent_errors || {})
                      .map((item) => item?.error_message)
                      .filter(Boolean)
                      .join("; ")}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">
              {currentRuns.length ? t.results : t.history}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {vi
                ? "Mỗi lượt là một record độc lập trong collection experiment_runs."
                : "Each run is an independent record in the experiment_runs collection."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadHistory}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t.refresh}
            </button>
            <input
              type="file"
              ref={metricsInputRef}
              accept=".xlsx,.xls"
              onChange={handleCalculateMetrics}
              className="hidden"
            />
            <button
              onClick={() => metricsInputRef.current?.click()}
              disabled={calculatingMetrics}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
            >
              {calculatingMetrics ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart2 className="h-4 w-4" />
              )}
              {vi ? "Tính Metrics từ Excel" : "Calculate Metrics"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {t.export}
            </button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6 dark:bg-slate-950/50">
          {[
            ["dataset_id", t.dataset, "text"],
            ["image_id", t.image, "text"],
            ["date_from", vi ? "Từ ngày" : "From date", "date"],
            ["date_to", vi ? "Đến ngày" : "To date", "date"],
          ].map(([name, label, type]) => (
            <label key={name}>
              <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
                {label}
              </span>
              <input
                type={type}
                value={filters[name]}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </label>
          ))}
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase text-slate-500">
              {t.status}
            </span>
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="">{t.allStatus}</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="completed">completed</option>
              <option value="completed_with_warning">completed_with_warning</option>
              <option value="failed">failed</option>
              <option value="partial">partial</option>
              <option value="stopped_rate_limit">stopped_rate_limit</option>
              <option value="stale">stale</option>
              <option value="completed_partial">completed_partial</option>
              <option value="completed_with_limit">completed_with_limit</option>
              <option value="no_banknote_detected">no_banknote_detected</option>
              <option value="technical_error">technical_error</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={loadHistory}
              className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white dark:bg-teal-500 dark:text-slate-950"
            >
              <Filter className="mr-1 inline h-4 w-4" /> {t.apply}
            </button>
            <button
              onClick={() => setFilters(INITIAL_FILTERS)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold dark:border-slate-700"
              title={t.clear}
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-950/70">
              <tr>
                {[
                  t.runNo,
                  t.dataset,
                  t.image,
                  t.prediction,
                  t.score,
                  t.agentVotes,
                  t.pipelineStatus,
                  t.duration,
                  t.issues,
                ].map((header) => (
                  <th key={header} className="px-4 py-3 font-black">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {displayedRows.map((run) => (
                <tr
                  key={run.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3 font-black text-slate-900 dark:text-white">
                    {run.run_no}/{run.repeat_count}
                  </td>
                  <td className="px-4 py-3">{run.dataset_id}</td>
                  <td className="px-4 py-3">{run.image_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {run.predicted_denomination || "—"}{" "}
                      {run.predicted_currency || ""}
                    </div>
                    <div className="text-xs text-slate-500">
                      {run.predicted_country || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-black">
                    {fieldCorrectCount(run)}/{fieldTotal(run)} ·{" "}
                    {Number(fieldScorePct(run)).toFixed(2)}%
                    <div className="mt-1 flex gap-1">
                      <CorrectIcon value={run.country_correct} />
                      <CorrectIcon value={run.currency_correct} />
                      <CorrectIcon value={run.denomination_correct} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <div className="font-black text-slate-900 dark:text-white">
                      {completedAgentCount(run)}/{agentTotal(run)}
                    </div>
                    <div className="mt-1">
                      {t.validVotes}: {metricValue(validVoteCount(run), agentTotal(run), t.notAvailable)}
                    </div>
                    <div>
                      {t.maximumAgreement}: {metricValue(maxMatchingVotes(run), agentTotal(run), t.notAvailable)}
                    </div>
                    <div>
                      {t.requiredVotes}: {metricValue(requiredVotes(run), null, t.notAvailable)}
                    </div>
                    <div className="font-black">
                      {t.consensus}:{" "}
                      {consensusReached(run) == null
                        ? t.notAvailable
                        : consensusReached(run)
                          ? t.consensusPassed
                          : t.consensusFailed}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={displayedStatus(run)} />
                    {isStaleRun(run) && (
                      <p className="mt-2 max-w-56 text-xs font-bold text-orange-700 dark:text-orange-300">
                        {t.staleWarning}
                      </p>
                    )}
                    <div className="mt-2 max-w-64 space-y-0.5 text-[10px] text-slate-500">
                      <p>AG1: {run.ag1_model || "—"}</p>
                      <p>AG2: {run.ag2_model || "—"}</p>
                      <p>AG3: {run.ag3_provider || "—"}</p>
                      <p>AG4: {run.ag4_model || "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {run.duration_ms
                      ? `${(run.duration_ms / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {hasRunError(run) ? (
                      <button
                        type="button"
                        onClick={() => setSelectedErrorRun(run)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black ${
                          issueSeverity(run) === "warning"
                            ? "border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                            : "border-rose-500/25 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
                        }`}
                      >
                        <AlertCircle className="h-3.5 w-3.5" />
                        {issueSeverity(run) === "warning"
                          ? t.viewWarning
                          : t.viewError}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!displayedRows.length && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-slate-500">
                    {t.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedErrorRun && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedErrorRun(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">
                  {t.issueDetails}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedErrorRun.dataset_id} · {selectedErrorRun.image_id} ·{" "}
                  {t.runNo} {selectedErrorRun.run_no}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyIssueDetails}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Copy className="h-4 w-4" />
                  {t.copyIssue}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedErrorRun(null)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  title={t.close}
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [t.dataset, selectedErrorRun.dataset_id],
                  [t.image, selectedErrorRun.image_id],
                  [t.runNo, `${selectedErrorRun.run_no}/${selectedErrorRun.repeat_count}`],
                  [
                    t.score,
                    `${fieldCorrectCount(selectedErrorRun)}/${fieldTotal(
                      selectedErrorRun,
                    )} · ${Number(fieldScorePct(selectedErrorRun)).toFixed(2)}%`,
                  ],
                  [
                    t.agentVotes,
                    `${completedAgentCount(selectedErrorRun)}/${agentTotal(
                      selectedErrorRun,
                    )}`,
                  ],
                  [
                    t.validVotes,
                    metricValue(validVoteCount(selectedErrorRun), agentTotal(selectedErrorRun), t.notAvailable),
                  ],
                  [
                    t.maximumAgreement,
                    metricValue(maxMatchingVotes(selectedErrorRun), agentTotal(selectedErrorRun), t.notAvailable),
                  ],
                  [t.requiredVotes, metricValue(requiredVotes(selectedErrorRun), null, t.notAvailable)],
                  [
                    t.consensus,
                    consensusReached(selectedErrorRun) == null
                      ? t.notAvailable
                      : consensusReached(selectedErrorRun)
                        ? t.consensusPassed
                        : t.consensusFailed,
                  ],
                  [t.pipelineStatus, pipelineStatus(selectedErrorRun)],
                  [t.severity, issueSeverity(selectedErrorRun)],
                  [
                    t.failedStages,
                    experimentAgentRows(selectedErrorRun)
                      .filter((agent) => agent.error?.severity === "error")
                      .map((agent) => agent.label)
                      .join(", ") || "—",
                  ],
                  [
                    t.warningStages,
                    experimentAgentRows(selectedErrorRun)
                      .filter((agent) => agent.error?.severity === "warning")
                      .map((agent) => agent.label)
                      .join(", ") || "—",
                  ],
                  [
                    t.duration,
                    selectedErrorRun.duration_ms != null
                      ? `${selectedErrorRun.duration_ms} ms`
                      : null,
                  ],
                  [
                    t.createdAt,
                    selectedErrorRun.created_at
                      ? new Date(selectedErrorRun.created_at).toLocaleString(
                          vi ? "vi-VN" : "en-US",
                        )
                      : null,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 break-words text-sm font-bold text-slate-900 dark:text-white">
                      {value ?? "—"}
                    </p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950/60">
                    <tr>
                      {["Agent", t.status, "Model/Provider", t.severity, vi ? "Loại lỗi" : "Issue type", t.duration].map((label) => (
                        <th key={label} className="px-3 py-2.5 font-black uppercase tracking-wide">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {experimentAgentRows(selectedErrorRun).map((agent) => (
                      <tr key={agent.key}>
                        <td className="px-3 py-3 font-black text-slate-900 dark:text-white">{agent.label}</td>
                        <td className="px-3 py-3"><StatusBadge value={agent.status} /></td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                          {agent.error?.provider || agent.model || "—"}
                        </td>
                        <td className="px-3 py-3">{agent.error?.severity || "—"}</td>
                        <td className="px-3 py-3 font-bold">{agent.error?.error_type || "—"}</td>
                        <td className="px-3 py-3">
                          {agent.error?.duration_ms != null ? `${agent.error.duration_ms} ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(selectedErrorRun.issue_message || selectedErrorRun.error_message) && (
                <div
                  className={`rounded-2xl border p-4 ${
                    issueSeverity(selectedErrorRun) === "warning"
                      ? "border-amber-500/25 bg-amber-500/10"
                      : "border-rose-500/25 bg-rose-500/10"
                  }`}
                >
                  <p
                    className={`text-xs font-black uppercase tracking-wide ${
                      issueSeverity(selectedErrorRun) === "warning"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-rose-600 dark:text-rose-300"
                    }`}
                  >
                    Issue message
                  </p>
                  <p
                    className={`mt-2 whitespace-pre-wrap break-words text-sm ${
                      issueSeverity(selectedErrorRun) === "warning"
                        ? "text-amber-800 dark:text-amber-200"
                        : "text-rose-800 dark:text-rose-200"
                    }`}
                  >
                    {selectedErrorRun.issue_message ||
                      selectedErrorRun.error_message}
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-sm font-black text-slate-900 dark:text-white">
                  {vi ? "Chi tiết lỗi theo Agent" : "Agent issue details"}
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {experimentAgentRows(selectedErrorRun)
                    .filter((agent) => agent.error)
                    .map((agent) => (
                    <div
                      key={agent.key}
                      className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-black text-slate-900 dark:text-white">
                          {agent.label}
                        </span>
                        <StatusBadge value={agent.status} />
                      </div>
                      <dl className="mt-3 space-y-2 text-xs">
                        {[
                          [vi ? "Loại" : "Type", agent.error.error_type],
                          [t.severity, agent.error.severity],
                          [t.provider, agent.error.provider || agent.model],
                          [t.httpStatus, agent.error.http_status],
                          [t.duration, agent.error.duration_ms != null ? `${agent.error.duration_ms} ms` : null],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="font-black text-slate-500">{label}</dt>
                            <dd className="mt-0.5 break-words text-slate-800 dark:text-slate-200">
                              {value ?? "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
                        {agent.error.error_message || "—"}
                      </p>
                      {agent.error.raw_excerpt && (
                        <details className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                          <summary className="cursor-pointer text-xs font-black text-slate-600 dark:text-slate-300">
                            {t.rawExcerpt}
                          </summary>
                          <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200">
                            {agent.error.raw_excerpt}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedErrorRun.raw_excerpt && (
                <details className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-slate-500">
                    {t.rawExcerpt}
                  </summary>
                  <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700 dark:text-slate-200">
                    {selectedErrorRun.raw_excerpt}
                  </pre>
                </details>
              )}
              
              {(selectedErrorRun.resize_debug || selectedErrorRun.models_used) && (
                <div>
                  <h3 className="mb-3 text-sm font-black text-slate-900 dark:text-white">
                    {vi ? "Cấu hình Runtime / Model / Resize" : "Runtime / Model / Resize"}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedErrorRun.models_used && (
                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <span className="font-black text-slate-900 dark:text-white">Models Used</span>
                        <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-fuchsia-600 dark:bg-slate-950/60 dark:text-fuchsia-300">
                          {JSON.stringify(selectedErrorRun.models_used, null, 2)}
                        </pre>
                      </div>
                    )}
                    {selectedErrorRun.resize_debug && (
                      <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <span className="font-black text-slate-900 dark:text-white">Resize Debug</span>
                        <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs text-sky-600 dark:bg-slate-950/60 dark:text-sky-300">
                          {JSON.stringify(selectedErrorRun.resize_debug, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
