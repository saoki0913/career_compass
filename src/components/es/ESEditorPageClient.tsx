"use client";

import { startTransition, useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDocument, type Document, type EsDocumentCategory, DocumentBlock } from "@/hooks/useDocuments";
import {
  DEFAULT_ES_DOCUMENT_CATEGORY,
  ES_DOCUMENT_CATEGORIES,
  ES_DOCUMENT_CATEGORY_LABELS,
} from "@/lib/es-document-category";
import { SectionReviewCTA } from "@/components/es/SectionReviewCTA";
import { OperationLockProvider, useOperationLock } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";
import { Printer } from "lucide-react";
import { ESEditorSkeleton } from "@/components/skeletons/ESEditorSkeleton";

const LG_MEDIA = "(min-width: 1024px)";
function subscribeLg(cb: () => void) {
  const mql = window.matchMedia(LG_MEDIA);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function getSnapshotLg() {
  return window.matchMedia(LG_MEDIA).matches;
}
function getServerSnapshotLg() {
  return false;
}
function useIsDesktop() {
  return useSyncExternalStore(subscribeLg, getSnapshotLg, getServerSnapshotLg);
}

// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const ReviewPanel = dynamic(
  () => import("@/components/es/ReviewPanel").then((mod) => mod.ReviewPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
        <LoadingSpinner />
      </div>
    ),
  }
);

const MobileReviewPanel = dynamic(
  () => import("@/components/es/MobileReviewPanel").then((mod) => mod.MobileReviewPanel),
  { ssr: false, loading: () => null }
);

const VersionHistory = dynamic(
  () => import("@/components/es/VersionHistory").then((mod) => mod.VersionHistory),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 text-center text-xs text-muted-foreground">履歴を読み込み中…</div>
    ),
  }
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const SparkleIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const PanelCloseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const PanelOpenIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

type BlockType = "h2" | "paragraph" | "bullet" | "numbered";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  h2: "見出し",
  paragraph: "段落",
  bullet: "箇条書き",
  numbered: "番号付き",
};

// Character limit presets
const CHAR_LIMIT_PRESETS = [200, 300, 400, 500, 600, 800, 1000];

interface ESEditorPageClientProps {
  documentId: string;
  initialDocument?: Document | null;
}

interface EditorBlockProps {
  block: DocumentBlock;
  index: number;
  sectionCharCount?: number;  // 設問配下の文字数（H2ブロックの場合）
  onChange: (index: number, content: string) => void;
  onTypeChange: (index: number, type: BlockType) => void;
  onCharLimitChange?: (index: number, charLimit: number | undefined) => void;
  onDelete: (index: number) => void;
  onAddBelow: (index: number) => void;
  onSectionReview?: (index: number) => void;  // 設問単位添削
  readOnly?: boolean;
}

function EditorBlock({
  block,
  index,
  sectionCharCount,
  onChange,
  onTypeChange,
  onCharLimitChange,
  onDelete,
  onAddBelow,
  onSectionReview,
  readOnly = false,
}: EditorBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showCharLimitInput, setShowCharLimitInput] = useState(false);
  const [customLimit, setCustomLimit] = useState("");

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }, [block.content]);

  // Character limit status calculation
  const getCharLimitStatus = () => {
    if (block.type !== "h2" || !block.charLimit || sectionCharCount === undefined) {
      return null;
    }
    if (sectionCharCount > block.charLimit) {
      return { color: "text-red-600 bg-red-50", label: "超過" };
    }
    return { color: "text-emerald-600 bg-emerald-50", label: "" };
  };

  const charLimitStatus = getCharLimitStatus();

  const handleSetCharLimit = (limit: number | undefined) => {
    if (onCharLimitChange) {
      onCharLimitChange(index, limit);
    }
    setShowCharLimitInput(false);
    setCustomLimit("");
  };

  const handleCustomLimitSubmit = () => {
    const num = parseInt(customLimit, 10);
    if (!isNaN(num) && num > 0) {
      handleSetCharLimit(num);
    }
  };

  const renderBlock = () => {
    const baseClass =
      "w-full bg-transparent resize-none focus:outline-none overflow-hidden print:!overflow-visible print:!max-h-none";

    switch (block.type) {
      case "h2":
        return (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder="設問を入力（例: 学生時代に頑張ったこと）"
              className={cn(baseClass, "text-lg font-bold")}
              rows={1}
              disabled={readOnly}
            />
            {/* Character limit indicator for H2 */}
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              {block.charLimit ? (
                <div className={cn(
                  "flex items-center gap-2 text-xs px-2 py-1 rounded-full",
                  charLimitStatus?.color || "text-muted-foreground bg-muted"
                )}>
                  <span>{sectionCharCount || 0}/{block.charLimit}文字</span>
                  {charLimitStatus?.label && <span className="font-medium">{charLimitStatus.label}</span>}
                  <button
                    type="button"
                    onClick={() => handleSetCharLimit(undefined)}
                    className="hover:text-red-700 ml-1"
                    title="文字数制限を解除"
                    disabled={readOnly}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCharLimitInput(!showCharLimitInput)}
                    className="text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors disabled:opacity-50"
                    disabled={readOnly}
                  >
                    + 文字数制限を設定
                  </button>
                  {showCharLimitInput && (
                    <div className="absolute left-0 top-full mt-1 p-3 bg-background border border-border rounded-lg shadow-lg z-20 min-w-[200px]">
                      <p className="text-xs text-muted-foreground mb-2">プリセット</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {CHAR_LIMIT_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleSetCharLimit(preset)}
                            className="px-2 py-1 text-xs bg-muted hover:bg-primary hover:text-primary-foreground rounded transition-colors disabled:opacity-50"
                          >
                            {preset}字
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">カスタム</p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={customLimit}
                          onChange={(e) => setCustomLimit(e.target.value)}
                          placeholder="例: 350"
                          className="flex-1 px-2 py-1 text-xs border border-input rounded"
                          min={1}
                          disabled={readOnly}
                        />
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={handleCustomLimitSubmit}
                          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                        >
                          設定
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Full-width CTA bar for section review */}
            {onSectionReview && (
              <div className="print:hidden">
                <SectionReviewCTA
                  onReview={() => onSectionReview(index)}
                  charCount={sectionCharCount || 0}
                  charLimit={block.charLimit}
                  disabled={readOnly || !block.content.trim()}
                  disabledReason={
                    readOnly
                      ? "添削実行中は編集できません"
                      : !block.content.trim()
                        ? "設問名を入力してください"
                        : undefined
                  }
                />
              </div>
            )}
          </div>
        );
      case "bullet":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder="リストアイテム..."
              className={cn(baseClass, "flex-1")}
              rows={1}
              disabled={readOnly}
            />
          </div>
        );
      case "numbered":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-muted-foreground flex-shrink-0">
              {index + 1}.
            </span>
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder="リストアイテム..."
              className={cn(baseClass, "flex-1")}
              rows={1}
              disabled={readOnly}
            />
          </div>
        );
      default:
        return (
          <textarea
            ref={textareaRef}
            value={block.content}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder="ここに回答を入力..."
            className={baseClass}
            rows={1}
            disabled={readOnly}
          />
        );
    }
  };

  return (
    <div
      className="group relative transition-all duration-300"
      id={block.type === "h2" ? `editor-section-${index}` : undefined}
    >
      <div className="flex items-start gap-2">
        {/* Block type selector */}
        <div className="relative print:hidden">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2.5 lg:p-1 rounded hover:bg-muted transition-all text-muted-foreground disabled:opacity-40"
            aria-label="ブロックタイプ変更"
            disabled={readOnly}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute left-0 top-full mt-1 w-32 bg-background border border-border rounded-lg shadow-lg z-10">
              {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    onTypeChange(index, type);
                    setShowMenu(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors disabled:opacity-50",
                    block.type === type && "bg-muted font-medium"
                  )}
                >
                  {BLOCK_TYPE_LABELS[type]}
                </button>
              ))}
              <div className="border-t border-border" />
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  onDelete(index);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                削除
              </button>
            </div>
          )}
        </div>

        {/* Block content */}
        <div className="flex-1">{renderBlock()}</div>

        {/* Add block button */}
        <button
          type="button"
          onClick={() => onAddBelow(index)}
          className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2.5 lg:p-1 rounded hover:bg-muted transition-all text-muted-foreground disabled:opacity-40 print:hidden"
          aria-label="ブロック追加"
          disabled={readOnly}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

function ESEditorPageInner({ documentId, initialDocument }: ESEditorPageClientProps) {
  const { isLocked } = useOperationLock();
  const isDesktop = useIsDesktop();

  const { document, isLoading, isSaving, error, updateDocument } = useDocument(
    documentId,
    initialDocument ? { initialData: initialDocument } : {}
  );
  const [title, setTitle] = useState("");
  const [esCategory, setEsCategory] = useState<EsDocumentCategory>(DEFAULT_ES_DOCUMENT_CATEGORY);
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(true);
  const [undoContent, setUndoContent] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [companyReviewStatusOverride, setCompanyReviewStatusOverride] = useState<{
    companyId: string;
    status: "company_status_checking" | "company_fetched_but_not_ready" | "ready_for_es_review";
  } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editorPrintRootRef = useRef<HTMLElement | null>(null);

  // Section review request state
  const [sectionReviewRequest, setSectionReviewRequest] = useState<{
    sectionTitle: string;
    sectionContent: string;
    sectionCharLimit?: number;
  } | null>(null);
  const currentCompanyId = document?.companyId ?? document?.company?.id ?? null;
  const currentCompanyInfoFetchedAt = document?.company?.infoFetchedAt ?? null;
  const currentCompanyCorporateInfoFetchedAt =
    document?.company?.corporateInfoFetchedAt ?? null;
  const currentCompanyAnyFetchedAt =
    currentCompanyCorporateInfoFetchedAt ?? currentCompanyInfoFetchedAt;

  // Initialize state from document
  useEffect(() => {
    if (document) {
      startTransition(() => {
        setTitle(document.title);
        setEsCategory(document.esCategory ?? DEFAULT_ES_DOCUMENT_CATEGORY);
        setBlocks(
          document.content && document.content.length > 0
            ? document.content
            : [
                { id: crypto.randomUUID(), type: "h2" as const, content: "" },
                { id: crypto.randomUUID(), type: "paragraph" as const, content: "" },
              ]
        );
      });
    }
  }, [document]);

  useEffect(() => {
    if (!currentCompanyId || !currentCompanyAnyFetchedAt) {
      return;
    }

    let cancelled = false;
    void fetch(`/api/companies/${currentCompanyId}/es-review-status`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return { status: "company_status_checking" as const };
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setCompanyReviewStatusOverride({
            companyId: currentCompanyId,
            status:
              data.status === "ready_for_es_review"
                ? "ready_for_es_review"
                : data.status === "company_fetched_but_not_ready"
                  ? "company_fetched_but_not_ready"
                  : "company_status_checking",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompanyReviewStatusOverride({
            companyId: currentCompanyId,
            status: "company_status_checking",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentCompanyAnyFetchedAt, currentCompanyId]);

  // 印刷プレビューでは textarea の高さが scrollHeight まで伸びず本文が切れることが多いため、レイアウト直前に同期する。
  useEffect(() => {
    const syncTextareasForPrint = () => {
      const root = editorPrintRootRef.current;
      if (!root) return;
      root.querySelectorAll("textarea").forEach((node) => {
        const ta = node as HTMLTextAreaElement;
        ta.style.height = "auto";
        const h = `${ta.scrollHeight}px`;
        ta.style.height = h;
        ta.style.minHeight = h;
      });
    };
    const restoreTextareaHeights = () => {
      const root = editorPrintRootRef.current;
      if (!root) return;
      root.querySelectorAll("textarea").forEach((node) => {
        const ta = node as HTMLTextAreaElement;
        ta.style.minHeight = "";
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight}px`;
      });
    };
    const onBeforePrint = () => {
      syncTextareasForPrint();
      requestAnimationFrame(() => {
        syncTextareasForPrint();
      });
    };
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", restoreTextareaHeights);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", restoreTextareaHeights);
    };
  }, []);

  // Auto-save with debounce
  const saveChanges = useCallback(async () => {
    if (!hasChanges || !document) return;

    const payload: { title: string; content: DocumentBlock[]; esCategory?: EsDocumentCategory } = {
      title,
      content: blocks,
    };
    if (document.type === "es") {
      payload.esCategory = esCategory;
    }

    const success = await updateDocument(payload);

    if (success) {
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }, [hasChanges, title, blocks, esCategory, document, updateDocument]);

  useEffect(() => {
    if (hasChanges) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(saveChanges, 2000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasChanges, saveChanges]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasChanges(true);
  };

  const handleBlockChange = (index: number, content: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], content };
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleBlockTypeChange = (index: number, type: BlockType) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], type };
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleDeleteBlock = (index: number) => {
    if (blocks.length <= 1) return;
    const newBlocks = blocks.filter((_, i) => i !== index);
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleAddBlock = (afterIndex: number) => {
    const newBlock: DocumentBlock = {
      id: crypto.randomUUID(),
      type: "paragraph",
      content: "",
    };
    const newBlocks = [
      ...blocks.slice(0, afterIndex + 1),
      newBlock,
      ...blocks.slice(afterIndex + 1),
    ];
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleCharLimitChange = (index: number, charLimit: number | undefined) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], charLimit };
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handleStatusToggle = useCallback(async () => {
    if (!document || statusUpdating || document.status === "deleted") return;
    const nextStatus = document.status === "published" ? "draft" : "published";
    setStatusUpdating(true);
    await updateDocument({ status: nextStatus });
    setStatusUpdating(false);
  }, [document, statusUpdating, updateDocument]);

  // Handle section review request
  const handleSectionReview = useCallback((index: number) => {
    const block = blocks[index];
    if (block.type !== "h2") return;

    // Collect content until next H2
    let sectionContent = "";
    for (let j = index + 1; j < blocks.length; j++) {
      if (blocks[j].type === "h2") break;
      sectionContent += blocks[j].content;
    }

    // Set section review request
    setSectionReviewRequest({
      sectionTitle: block.content.trim(),
      sectionContent,
      sectionCharLimit: block.charLimit,
    });

    // Ensure review panel is open
    setShowReviewPanel(true);
  }, [blocks]);

  // Clear section review request (called when returning to full mode)
  const handleClearSectionReview = useCallback(() => {
    setSectionReviewRequest(null);
  }, []);

  // Calculate character count for each section (H2 + following paragraphs until next H2)
  const getSectionCharCounts = useCallback(() => {
    const counts: { [index: number]: number } = {};
    let currentH2Index: number | null = null;
    let currentCount = 0;

    blocks.forEach((block, index) => {
      if (block.type === "h2") {
        // Save previous section's count
        if (currentH2Index !== null) {
          counts[currentH2Index] = currentCount;
        }
        // Start new section
        currentH2Index = index;
        currentCount = 0;
      } else {
        // Add to current section's count
        currentCount += block.content.length;
      }
    });

    // Save last section's count
    if (currentH2Index !== null) {
      counts[currentH2Index] = currentCount;
    }

    return counts;
  }, [blocks]);

  const sectionCharCounts = getSectionCharCounts();

  // Calculate character count
  const totalCharCount = blocks.reduce((acc, block) => acc + block.content.length, 0);

  // Handle apply rewrite - replace section content or copy full document
  const handleApplyRewrite = useCallback((newContent: string, sectionTitle?: string | null) => {
    // Save current state for undo
    setUndoContent(JSON.stringify(blocks));

    if (sectionTitle) {
      // Section mode: replace paragraph blocks under the matching H2
      const newBlocks = [...blocks];
      for (let i = 0; i < newBlocks.length; i++) {
        if (newBlocks[i].type === "h2" && newBlocks[i].content.trim() === sectionTitle) {
          // Find range of non-H2 blocks after this H2
          let endIndex = i + 1;
          while (endIndex < newBlocks.length && newBlocks[endIndex].type !== "h2") {
            endIndex++;
          }
          // Replace with a single paragraph block containing the rewrite
          const newParagraph: DocumentBlock = {
            id: crypto.randomUUID(),
            type: "paragraph",
            content: newContent,
          };
          newBlocks.splice(i + 1, endIndex - (i + 1), newParagraph);
          break;
        }
      }
      setBlocks(newBlocks);
      setHasChanges(true);
    }
  }, [blocks]);

  // Handle undo for reflected content
  const handleUndoReflect = useCallback(() => {
    if (undoContent) {
      try {
        const parsedContent = JSON.parse(undoContent);
        if (Array.isArray(parsedContent)) {
          setBlocks(parsedContent);
          setHasChanges(true);
          setUndoContent(null);
        }
      } catch (error) {
        console.error("Failed to undo:", error);
      }
    }
  }, [undoContent]);

  // Handle version restore
  const handleRestoreVersion = useCallback((content: string) => {
    setRestoreError(null);
    try {
      const parsedContent = JSON.parse(content);
      if (Array.isArray(parsedContent)) {
        // Save current content for undo
        setUndoContent(JSON.stringify(blocks));
        setBlocks(parsedContent);
        setHasChanges(true);
      } else {
        setRestoreError("バージョンの復元に失敗しました: 無効な形式");
      }
    } catch (error) {
      console.error("Failed to restore version:", error);
      setRestoreError("バージョンの復元に失敗しました");
    }
  }, [blocks]);

  const companyReviewStatus = !currentCompanyId
    ? "no_company_selected"
    : !currentCompanyAnyFetchedAt
      ? companyReviewStatusOverride?.companyId === currentCompanyId
        ? companyReviewStatusOverride.status
        : "company_selected_not_fetched"
      : companyReviewStatusOverride?.companyId === currentCompanyId
        ? companyReviewStatusOverride.status
        : "company_status_checking";

  if (isLoading) {
    return <ESEditorSkeleton />;
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="py-8 text-center">
              <h2 className="text-lg font-semibold text-red-800 mb-2">
                {error || "ドキュメントが見つかりません"}
              </h2>
              <Button variant="outline" asChild className="mt-4">
                <Link href="/es">ES一覧に戻る</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <>
    <NavigationGuard />
    <div className="es-editor-print-scope h-screen bg-background flex flex-col overflow-hidden print:block print:h-auto print:min-h-0 print:max-h-none print:overflow-visible">
      {/* Header Bar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-14 flex-col gap-2 py-2 lg:h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-0 lg:py-0">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <Link
                href="/es"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon />
                <span className="hidden sm:inline">ES一覧</span>
              </Link>
              <span className="text-muted-foreground/30 max-lg:hidden">|</span>
              <div className="flex min-w-0 items-center gap-2">
                {document?.company && (
                  <>
                    <Link
                      href={`/companies/${document.company.id}`}
                      className="text-sm text-primary hover:underline truncate max-w-[200px] sm:max-w-[250px] lg:max-w-[200px]"
                    >
                      {document.company.name}
                    </Link>
                    <span className="text-muted-foreground/50 flex-shrink-0 hidden sm:inline">›</span>
                  </>
                )}
                <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline sm:max-w-none">
                  {title || "無題のドキュメント"}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4 lg:flex-nowrap lg:justify-end">
              <span className="text-xs sm:text-sm text-muted-foreground">{totalCharCount}文字</span>
              <span className="text-xs sm:text-sm flex items-center gap-1 min-w-[4rem]">
                {isSaving ? (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <LoadingSpinner />
                    <span className="hidden sm:inline">保存中...</span>
                  </span>
                ) : restoreError ? (
                  <span className="text-destructive flex items-center gap-1">
                    {restoreError}
                    <button type="button" onClick={() => setRestoreError(null)} className="ml-1 hover:opacity-70" aria-label="閉じる">&times;</button>
                  </span>
                ) : hasChanges ? (
                  <span className="text-amber-600 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    未保存
                  </span>
                ) : saveSuccess ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckIcon />
                    <span className="hidden sm:inline">保存済み</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground/50 flex items-center gap-1">
                    <CheckIcon />
                    <span className="hidden sm:inline">保存済み</span>
                  </span>
                )}
              </span>
              {document.status !== "deleted" && (
                <Button
                  variant={document.status === "published" ? "secondary" : "outline"}
                  size="sm"
                  onClick={handleStatusToggle}
                  disabled={statusUpdating || isLocked}
                  className="max-lg:shrink-0"
                >
                  {statusUpdating ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-1">更新中</span>
                    </>
                  ) : document.status === "published" ? (
                    <>
                      <span className="lg:hidden">下書きへ</span>
                      <span className="hidden lg:inline">下書きに戻す</span>
                    </>
                  ) : (
                    <>
                      <span className="lg:hidden">提出済</span>
                      <span className="hidden lg:inline">提出済みにする</span>
                    </>
                  )}
                </Button>
              )}
              <Button onClick={saveChanges} disabled={isSaving || !hasChanges || isLocked} size="sm">
                保存
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 print:hidden"
                title="ブラウザの印刷でPDFに保存できます。余計なタイトルやURLが入る場合は、印刷ダイアログの「ヘッダーとフッター」（または同等の項目）をオフにしてください。"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                <span className="hidden sm:inline">PDF/印刷</span>
              </Button>
              <Button
                variant={showReviewPanel ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowReviewPanel(!showReviewPanel)}
                className="hidden lg:inline-flex gap-1"
              >
                <SparkleIcon />
                <span className="hidden sm:inline">AI添削</span>
                {showReviewPanel ? <PanelCloseIcon /> : <PanelOpenIcon />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Split Layout */}
      <main
        ref={editorPrintRootRef}
        className="flex-1 flex overflow-hidden print:overflow-visible print:min-h-0 print:h-auto print:max-h-none print:block print:w-full"
      >
        {/* Editor Panel */}
        <div
          className={cn(
            "flex-1 overflow-y-auto pb-mobile-tab transition-all duration-300 print:overflow-visible print:max-h-none print:min-h-0 print:h-auto print:w-full print:max-w-none print:pb-0",
            isDesktop && showReviewPanel ? "w-[55%]" : "w-full"
          )}
        >
          <div className="es-print-body max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 print:max-w-none print:w-full print:mx-0 print:px-16 print:py-0">
            <Card className="print:shadow-none print:border-0 print:rounded-none print:bg-transparent print:py-0 print:gap-0">
              <CardContent className="p-6 print:p-0 print:px-0">
                {/* Title */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="タイトルを入力..."
                  disabled={isLocked}
                  className="w-full text-2xl font-bold bg-transparent focus:outline-none mb-6 placeholder:text-muted-foreground/50 disabled:opacity-60 disabled:cursor-not-allowed"
                />

                {/* Company name + document category (ES): one row, category top-right of card */}
                {(document.company || document.type === "es") && (
                  <div className="mb-6 pb-4 border-b border-border print:border-border flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0 shrink">
                      {document.company ? (
                        <Link
                          href={`/companies/${document.company.id}`}
                          className="text-sm text-primary hover:underline print:text-black print:no-underline"
                        >
                          {document.company.name}
                        </Link>
                      ) : null}
                    </div>
                    {document.type === "es" && (
                      <div className="print:hidden flex w-full flex-col gap-1.5 sm:w-auto sm:max-w-xs sm:items-end sm:shrink-0">
                        <label
                          htmlFor="editor-es-category"
                          className="text-sm text-muted-foreground sm:text-right"
                        >
                          文書の分類
                        </label>
                        <Select
                          value={esCategory}
                          onValueChange={(v) => {
                            setEsCategory(v as EsDocumentCategory);
                            setHasChanges(true);
                          }}
                          disabled={isLocked}
                        >
                          <SelectTrigger id="editor-es-category" className="h-9 w-full font-normal sm:max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ES_DOCUMENT_CATEGORIES.map((key) => (
                              <SelectItem key={key} value={key}>
                                {ES_DOCUMENT_CATEGORY_LABELS[key]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* Blocks */}
                <div className="space-y-4">
                  {blocks.map((block, index) => (
                    <EditorBlock
                      key={block.id}
                      block={block}
                      index={index}
                      sectionCharCount={block.type === "h2" ? sectionCharCounts[index] : undefined}
                      onChange={handleBlockChange}
                      onTypeChange={handleBlockTypeChange}
                      onCharLimitChange={handleCharLimitChange}
                      onDelete={handleDeleteBlock}
                      onAddBelow={handleAddBlock}
                      onSectionReview={handleSectionReview}
                      readOnly={isLocked}
                    />
                  ))}
                </div>

                {/* Add block button */}
                <button
                  type="button"
                  onClick={() => handleAddBlock(blocks.length - 1)}
                  disabled={isLocked}
                  className="mt-4 w-full py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none print:hidden"
                >
                  <PlusIcon />
                  ブロックを追加
                </button>
              </CardContent>
            </Card>

            {/* Help text */}
            <p className="mt-6 hidden text-center text-sm text-muted-foreground print:hidden lg:block">
              左のメニューからブロックの種類を変更できます。変更は自動保存されます。
            </p>
            <p className="mt-6 block text-center text-sm text-muted-foreground print:hidden lg:hidden">
              各ブロック左のメニューから種類を変更できます。変更は自動保存されます。
            </p>
          </div>
        </div>

        {/* Review Panel — desktop only (single useESReview instance) */}
        {isDesktop && showReviewPanel && (
          <div className="flex w-[45%] flex-col border-l border-border bg-muted/20 overflow-hidden min-h-0 print:hidden">
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="min-h-0 flex-1">
                <ReviewPanel
                  documentId={documentId}
                  companyReviewStatus={companyReviewStatus}
                  companyId={document?.company?.id}
                  companyName={document?.company?.name}
                  onApplyRewrite={handleApplyRewrite}
                  onUndo={handleUndoReflect}
                  sectionReviewRequest={sectionReviewRequest}
                  onClearSectionReview={handleClearSectionReview}
                  supplementalContent={
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <VersionHistory
                        documentId={documentId}
                        onRestore={handleRestoreVersion}
                        restoreDisabled={isLocked}
                      />
                    </div>
                  }
                  className="h-full"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Review Panel — mobile only (single useESReview instance) */}
      {!isDesktop && (
        <div className="print:hidden">
          <MobileReviewPanel
            documentId={documentId}
            companyReviewStatus={companyReviewStatus}
            companyId={document?.company?.id}
            companyName={document?.company?.name}
            onApplyRewrite={handleApplyRewrite}
            onUndo={handleUndoReflect}
            sectionReviewRequest={sectionReviewRequest}
            onClearSectionReview={handleClearSectionReview}
          />
        </div>
      )}
    </div>
    </>
  );
}

export default function ESEditorPageClient(props: ESEditorPageClientProps) {
  return (
    <OperationLockProvider>
      <ESEditorPageInner {...props} />
    </OperationLockProvider>
  );
}
