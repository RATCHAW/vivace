"use client";

// Trimmed from the AI Elements registry (elements.ai-sdk.dev) to what the coach
// composer actually uses, and re-pointed at Base UI. What went: the optional
// global `PromptInputProvider`, screenshot capture, referenced sources, the tab
// and command palettes, and the model `Select` — none of which this app has a
// second surface for. What stayed is the piece worth vendoring: a form that
// carries file attachments beside the text and hands both to `sendMessage` as
// `UIMessage` parts.

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { i18n } from "@/i18n";
import { useTranslation } from "react-i18next";
import type { ChatStatus, FileUIPart } from "ai";
import {
  ArrowUpIcon,
  ImageIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
} from "react";
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * A blob: URL only means something to the tab that made it, so an attachment is
 * inlined as a data URL on its way out — that is what actually reaches the API,
 * the database and the model.
 */
const convertBlobUrlToDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export interface AttachmentsContext {
  files: (FileUIPart & { id: string })[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

const AttachmentsContextValue = createContext<AttachmentsContext | null>(null);

export const usePromptInputAttachments = () => {
  const context = useContext(AttachmentsContextValue);
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput"
    );
  }
  return context;
};

export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit" | "onError"
> & {
  /** e.g. "image/*"; leave undefined to accept anything. */
  accept?: string;
  multiple?: boolean;
  /** Accept drops anywhere on the document rather than only on the form. */
  globalDrop?: boolean;
  maxFiles?: number;
  /** Bytes. */
  maxFileSize?: number;
  onError?: (err: {
    code: "max_files" | "max_file_size" | "accept";
    message: string;
  }) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
};

export const PromptInput = ({
  className,
  accept,
  multiple,
  globalDrop,
  maxFiles,
  maxFileSize,
  onError,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [files, setFiles] = useState<(FileUIPart & { id: string })[]>([]);

  // Cleanup on unmount reads through a ref, so it can't close over a stale list.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const matchesAccept = useCallback(
    (file: File) => {
      if (!accept || accept.trim() === "") return true;
      return accept
        .split(",")
        .map((pattern) => pattern.trim())
        .filter(Boolean)
        .some((pattern) =>
          pattern.endsWith("/*")
            ? file.type.startsWith(pattern.slice(0, -1))
            : file.type === pattern
        );
    },
    [accept]
  );

  const add = useCallback(
    (fileList: File[] | FileList) => {
      const incoming = [...fileList];
      const accepted = incoming.filter(matchesAccept);
      if (incoming.length && accepted.length === 0) {
        onError?.({
          code: "accept",
          message: i18n.t("ai.filesNotAccepted"),
        });
        return;
      }

      const sized = accepted.filter((file) =>
        maxFileSize ? file.size <= maxFileSize : true
      );
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({
          code: "max_file_size",
          message: i18n.t("ai.filesTooLarge"),
        });
        return;
      }

      setFiles((prev) => {
        const capacity =
          typeof maxFiles === "number"
            ? Math.max(0, maxFiles - prev.length)
            : undefined;
        const capped =
          typeof capacity === "number" ? sized.slice(0, capacity) : sized;
        if (typeof capacity === "number" && sized.length > capacity) {
          onError?.({
            code: "max_files",
            message: i18n.t("ai.tooManyFiles"),
          });
        }
        return [
          ...prev,
          ...capped.map((file) => ({
            filename: file.name,
            id: nanoid(),
            mediaType: file.type,
            type: "file" as const,
            url: URL.createObjectURL(file),
          })),
        ];
      });
    },
    [matchesAccept, maxFiles, maxFileSize, onError]
  );

  const remove = useCallback(
    (id: string) =>
      setFiles((prev) => {
        const found = prev.find((file) => file.id === id);
        if (found?.url) URL.revokeObjectURL(found.url);
        return prev.filter((file) => file.id !== id);
      }),
    []
  );

  const clear = useCallback(
    () =>
      setFiles((prev) => {
        for (const file of prev) {
          if (file.url) URL.revokeObjectURL(file.url);
        }
        return [];
      }),
    []
  );

  const openFileDialog = useCallback(() => inputRef.current?.click(), []);

  // Drops land on the form, or on the whole document when opted in.
  useEffect(() => {
    const target: HTMLElement | Document | null = globalDrop
      ? document
      : formRef.current;
    if (!target) return;

    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
      if (event.dataTransfer?.files?.length) add(event.dataTransfer.files);
    };

    target.addEventListener("dragover", onDragOver as EventListener);
    target.addEventListener("drop", onDrop as EventListener);
    return () => {
      target.removeEventListener("dragover", onDragOver as EventListener);
      target.removeEventListener("drop", onDrop as EventListener);
    };
  }, [add, globalDrop]);

  useEffect(
    () => () => {
      for (const file of filesRef.current) {
        if (file.url) URL.revokeObjectURL(file.url);
      }
    },
    []
  );

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (event) => {
      if (event.currentTarget.files) add(event.currentTarget.files);
      // Reset so re-picking a file that was just removed still fires a change.
      event.currentTarget.value = "";
    },
    [add]
  );

  const attachments = useMemo<AttachmentsContext>(
    () => ({ add, clear, fileInputRef: inputRef, files, openFileDialog, remove }),
    [files, add, remove, clear, openFileDialog]
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();

      const form = event.currentTarget;
      const text = (new FormData(form).get("message") as string) || "";
      // Reset before the await, or anything typed during the blob conversion
      // would be wiped when it resolves.
      form.reset();

      try {
        const converted: FileUIPart[] = await Promise.all(
          files.map(async ({ id: _id, ...file }) =>
            file.url?.startsWith("blob:")
              ? { ...file, url: (await convertBlobUrlToDataUrl(file.url)) ?? file.url }
              : file
          )
        );

        await onSubmit({ files: converted, text }, event);
        clear();
      } catch {
        // Leave the attachments in place — the athlete may want to retry.
      }
    },
    [files, onSubmit, clear]
  );

  return (
    <AttachmentsContextValue.Provider value={attachments}>
      <input
        accept={accept}
        aria-label={i18n.t("ai.uploadFiles")}
        className="hidden"
        multiple={multiple}
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <form
        className={cn("w-full", className)}
        onSubmit={handleSubmit}
        ref={formRef}
        {...props}
      >
        {/* rounded-lg is DESIGN.md's 20px; the composer is a card, not a pill. */}
        <InputGroup className="overflow-hidden rounded-lg">{children}</InputGroup>
      </form>
    </AttachmentsContextValue.Provider>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export const PromptInputTextarea = ({
  onKeyDown,
  className,
  placeholder,
  ...props
}: PromptInputTextareaProps) => {
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      if (e.key === "Enter") {
        // An IME candidate window is mid-word, and shift+enter is a newline.
        if (isComposing || e.nativeEvent.isComposing || e.shiftKey) return;
        e.preventDefault();

        const { form } = e.currentTarget;
        const submit = form?.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        );
        if (submit?.disabled) return;
        form?.requestSubmit();
      }

      // Backspace in an empty box peels off the last attachment.
      if (
        e.key === "Backspace" &&
        e.currentTarget.value === "" &&
        attachments.files.length > 0
      ) {
        e.preventDefault();
        const last = attachments.files.at(-1);
        if (last) attachments.remove(last.id);
      }
    },
    [onKeyDown, isComposing, attachments]
  );

  const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const pasted: File[] = [];
      for (const item of event.clipboardData?.items ?? []) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
      if (pasted.length > 0) {
        event.preventDefault();
        attachments.add(pasted);
      }
    },
    [attachments]
  );

  return (
    <InputGroupTextarea
      className={cn("text-body-md max-h-48 min-h-16 px-4.5 py-3.5", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      placeholder={placeholder}
      {...props}
    />
  );
};

export type PromptInputHeaderProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export const PromptInputHeader = ({
  className,
  ...props
}: PromptInputHeaderProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn("order-first flex-wrap gap-1.5 px-3.5 pt-3", className)}
    {...props}
  />
);

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn("justify-between gap-1.5 px-3 pb-3", className)}
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({
  className,
  ...props
}: PromptInputToolsProps) => (
  <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
);

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  tooltip?: ReactNode;
};

export const PromptInputButton = ({
  variant = "ghost",
  className,
  size,
  tooltip,
  ...props
}: PromptInputButtonProps) => {
  const button = (
    <InputGroupButton
      className={className}
      size={size ?? (Children.count(props.children) > 1 ? "sm" : "icon-sm")}
      type="button"
      variant={variant}
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
};

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>;

export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
  <DropdownMenu {...props} />
);

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps;

export const PromptInputActionMenuTrigger = ({
  className,
  children,
  ...props
}: PromptInputActionMenuTriggerProps) => (
  <DropdownMenuTrigger
    render={<PromptInputButton className={className} {...props} />}
  >
    {children ?? <PlusIcon />}
  </DropdownMenuTrigger>
);

export type PromptInputActionMenuContentProps = ComponentProps<
  typeof DropdownMenuContent
>;

export const PromptInputActionMenuContent = (
  props: PromptInputActionMenuContentProps
) => <DropdownMenuContent align="start" {...props} />;

export type PromptInputActionAddAttachmentsProps = ComponentProps<
  typeof DropdownMenuItem
> & {
  label?: string;
};

export const PromptInputActionAddAttachments = ({
  label,
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const text = label ?? t("ai.addAttachments");

  return (
    // Base UI menu items act on click and close themselves; there is no Radix
    // `onSelect` here.
    <DropdownMenuItem {...props} onClick={() => attachments.openFileDialog()}>
      <ImageIcon />
      {text}
    </DropdownMenuItem>
  );
};

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

/** The one loud control on the surface — DESIGN.md's `button-primary` pill. */
export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";

  let Icon = <ArrowUpIcon />;
  if (status === "submitted") {
    Icon = <Spinner />;
  } else if (status === "streaming") {
    Icon = <SquareIcon />;
  } else if (status === "error") {
    Icon = <XIcon />;
  }

  // Inferred from the button rather than React, so the Base UI event extras
  // (preventBaseUIHandler) come along with it.
  const handleClick: NonNullable<PromptInputSubmitProps["onClick"]> =
    useCallback(
      (e) => {
        if (isGenerating && onStop) {
          e.preventDefault();
          onStop();
          return;
        }
        onClick?.(e);
      },
      [isGenerating, onStop, onClick]
    );

  return (
    <InputGroupButton
      aria-label={isGenerating ? i18n.t("ai.stop") : i18n.t("ai.send")}
      className={cn("rounded-full", className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};
