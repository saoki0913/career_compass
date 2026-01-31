"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDocument, DocumentBlock } from "@/hooks/useDocuments";
import { ReviewPanel, VersionHistory, AIThreadHistory } from "@/components/es";

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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
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
}

function EditorBlock({ block, index, sectionCharCount, onChange, onTypeChange, onCharLimitChange, onDelete, onAddBelow, onSectionReview }: EditorBlockProps) {
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
    const percentage = (sectionCharCount / block.charLimit) * 100;
    if (percentage >= 100) return { color: "text-red-600 bg-red-50", label: "超過" };
    if (percentage >= 90) return { color: "text-red-600 bg-red-50", label: "注意" };
    if (percentage >= 70) return { color: "text-amber-600 bg-amber-50", label: "" };
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
      "w-full bg-transparent resize-none focus:outline-none overflow-hidden";

    switch (block.type) {
      case "h2":
        return (
          <div className="space-y-2">
            <textarea
              ref={textareaRef}
              value={block.content}
              onChange={(e) => onChange(index, e.target.value)}
              placeholder="設問を入力..."
              className={cn(baseClass, "text-lg font-bold")}
              rows={1}
            />
            {/* Character limit indicator and section review button for H2 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Section review button */}
              {onSectionReview && (
                <button
                  type="button"
                  onClick={() => onSectionReview(index)}
                  className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1"
                  title="この設問を添削"
                >
                  <SparkleIcon />
                  添削
                </button>
              )}
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
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCharLimitInput(!showCharLimitInput)}
                    className="text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded-full bg-muted/50 hover:bg-muted transition-colors"
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
                            onClick={() => handleSetCharLimit(preset)}
                            className="px-2 py-1 text-xs bg-muted hover:bg-primary hover:text-primary-foreground rounded transition-colors"
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
                        />
                        <button
                          type="button"
                          onClick={handleCustomLimitSubmit}
                          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          設定
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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
            />
          </div>
        );
      default:
        return (
          <textarea
            ref={textareaRef}
            value={block.content}
            onChange={(e) => onChange(index, e.target.value)}
            placeholder="テキストを入力..."
            className={baseClass}
            rows={1}
          />
        );
    }
  };

  return (
    <div className="group relative">
      <div className="flex items-start gap-2">
        {/* Block type selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all text-muted-foreground"
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
                  onClick={() => {
                    onTypeChange(index, type);
                    setShowMenu(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                    block.type === type && "bg-muted font-medium"
                  )}
                >
                  {BLOCK_TYPE_LABELS[type]}
                </button>
              ))}
              <div className="border-t border-border" />
              <button
                type="button"
                onClick={() => {
                  onDelete(index);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
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
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all text-muted-foreground"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

export default function ESEditorPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.id as string;

  const { document, isLoading, isSaving, error, updateDocument } = useDocument(documentId);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<DocumentBlock[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(true);
  const [undoContent, setUndoContent] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Section review request state
  const [sectionReviewRequest, setSectionReviewRequest] = useState<{
    sectionTitle: string;
    sectionContent: string;
    sectionCharLimit?: number;
  } | null>(null);

  // Initialize state from document
  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setBlocks(
        document.content && document.content.length > 0
          ? document.content
          : [{ id: crypto.randomUUID(), type: "h2", content: "" }]
      );
    }
  }, [document]);

  // Auto-save with debounce
  const saveChanges = useCallback(async () => {
    if (!hasChanges) return;

    const success = await updateDocument({
      title,
      content: blocks,
    });

    if (success) {
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }, [hasChanges, title, blocks, updateDocument]);

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

  // Get content for review
  const getContentForReview = useCallback(() => {
    return blocks.map((block) => block.content).join("\n\n");
  }, [blocks]);

  // Get section titles (H2 blocks)
  const getSectionTitles = useCallback(() => {
    return blocks
      .filter((block) => block.type === "h2" && block.content.trim())
      .map((block) => block.content.trim());
  }, [blocks]);

  // Get section data with character limits for review
  const getSectionData = useCallback(() => {
    const result: Array<{
      title: string;
      content: string;
      charLimit?: number;
    }> = [];

    // Find all H2 blocks and their following content
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.type === "h2" && block.content.trim()) {
        // Collect content until next H2
        let sectionContent = "";
        for (let j = i + 1; j < blocks.length; j++) {
          if (blocks[j].type === "h2") break;
          sectionContent += blocks[j].content;
        }
        result.push({
          title: block.content.trim(),
          content: sectionContent,
          charLimit: block.charLimit,
        });
      }
    }
    return result;
  }, [blocks]);

  // Handle apply rewrite (for now, just copy to clipboard)
  const handleApplyRewrite = useCallback((newContent: string) => {
    navigator.clipboard.writeText(newContent);
    // TODO: Implement actual content replacement
    alert("リライト内容をクリップボードにコピーしました");
  }, []);

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
    try {
      const parsedContent = JSON.parse(content);
      if (Array.isArray(parsedContent)) {
        // Save current content for undo
        setUndoContent(JSON.stringify(blocks));
        setBlocks(parsedContent);
        setHasChanges(true);
      } else {
        alert("バージョンの復元に失敗しました: 無効な形式");
      }
    } catch (error) {
      console.error("Failed to restore version:", error);
      alert("バージョンの復元に失敗しました");
    }
  }, [blocks]);

  // Check if document has company RAG data (company info was fetched by AI)
  const hasCompanyRag = document?.company?.infoFetchedAt != null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        </main>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
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
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader />

      {/* Header Bar */}
      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <Link
                href="/es"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon />
                <span className="hidden sm:inline">ES一覧</span>
              </Link>
              <span className="text-muted-foreground/30">|</span>
              <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-none">
                {title || "無題のドキュメント"}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-muted-foreground">{totalCharCount}文字</span>
              {isSaving && (
                <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                  <LoadingSpinner />
                  <span className="hidden sm:inline">保存中...</span>
                </span>
              )}
              {saveSuccess && (
                <span className="text-xs sm:text-sm text-emerald-600 flex items-center gap-1">
                  <CheckIcon />
                  <span className="hidden sm:inline">保存しました</span>
                </span>
              )}
              {hasChanges && !isSaving && (
                <span className="text-xs sm:text-sm text-amber-600 hidden sm:inline">未保存</span>
              )}
              <Button onClick={saveChanges} disabled={isSaving || !hasChanges} size="sm">
                保存
              </Button>
              <Button
                variant={showReviewPanel ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowReviewPanel(!showReviewPanel)}
                className="gap-1"
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
      <main className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div
          className={cn(
            "flex-1 overflow-y-auto transition-all duration-300",
            showReviewPanel ? "lg:w-[60%]" : "w-full"
          )}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Card>
              <CardContent className="p-6">
                {/* Title */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="タイトルを入力..."
                  className="w-full text-2xl font-bold bg-transparent focus:outline-none mb-6 placeholder:text-muted-foreground/50"
                />

                {/* Company link */}
                {document.company && (
                  <div className="mb-6 pb-4 border-b border-border">
                    <Link
                      href={`/companies/${document.company.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {document.company.name}
                    </Link>
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
                    />
                  ))}
                </div>

                {/* Add block button */}
                <button
                  type="button"
                  onClick={() => handleAddBlock(blocks.length - 1)}
                  className="mt-4 w-full py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2"
                >
                  <PlusIcon />
                  ブロックを追加
                </button>
              </CardContent>
            </Card>

            {/* Help text */}
            <p className="text-sm text-muted-foreground text-center mt-6">
              左のメニューからブロックの種類を変更できます。変更は自動保存されます。
            </p>
          </div>
        </div>

        {/* Review Panel */}
        {showReviewPanel && (
          <div className="hidden lg:block w-[40%] border-l border-border bg-muted/20 overflow-y-auto">
            <div className="space-y-6 p-4">
              {/* AI Review Panel */}
              <ReviewPanel
                documentId={documentId}
                content={getContentForReview()}
                sections={getSectionTitles()}
                sectionData={getSectionData()}
                hasCompanyRag={hasCompanyRag}
                companyId={document?.company?.id}
                isPaid={false}
                onApplyRewrite={handleApplyRewrite}
                onUndo={handleUndoReflect}
                sectionReviewRequest={sectionReviewRequest}
                onClearSectionReview={handleClearSectionReview}
              />

              {/* Version History */}
              <VersionHistory
                documentId={documentId}
                onRestore={handleRestoreVersion}
              />
            </div>
          </div>
        )}
      </main>

      {/* Mobile Review Panel Toggle Info */}
      {showReviewPanel && (
        <div className="lg:hidden fixed bottom-4 left-4 right-4 bg-primary text-primary-foreground p-4 rounded-xl shadow-lg">
          <p className="text-sm text-center">
            AI添削パネルはデスクトップ版で利用できます
          </p>
        </div>
      )}
    </div>
  );
}
