"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  MinusCircle,
  PlusCircle,
  Settings,
  Clipboard,
  ClipboardCheck,
  Settings2,
  X,
  Wrench,
  Plus,
  Pencil,
  ArrowDown,
  Type,
  Image,
  Check,
  Paperclip,
  Sun,
  Moon,
} from "lucide-react";

import { Dialog, Tab } from "@headlessui/react";

import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneLight as light,
  oneDark as dark,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css"; // `rehype-katex` does not import the CSS for you

import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";

import OpenAI from "openai";
import {
  ChatCompletionRole,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
  ChatCompletionChunk,
  ChatCompletion,
} from "openai/resources/chat/index";
import React from "react";
import { Stream } from "openai/streaming.mjs";
import { useTheme } from "next-themes";

const createChatCompletion = (
  messages: ChatCompletionMessageParam[],
  settings: Settings,
  tools: ChatCompletionTool[],
  toolChoice: ChatCompletionToolChoiceOption,
  { signal }: { signal: AbortSignal }
) => {
  const baseURL = localStorage.getItem("baseURL");
  const apiKey = localStorage.getItem("apiKey") || "";
  const model = settings.model;
  const seed = settings.seed;
  const temperature = settings.temperature;
  const maxTokens = settings.maxTokens;
  const frequencyPenalty = settings.frequencyPenalty;
  const presencePenalty = settings.presencePenalty;
  const stop = settings.stop;
  const jsonMode = settings.jsonMode;
  const stream = settings.stream;
  const openai = new OpenAI({
    baseURL: baseURL === "" ? undefined : baseURL,
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  return openai.chat.completions.create(
    {
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice:
        toolChoice !== "auto" && tools.length > 0 ? toolChoice : undefined,
      model,
      seed: seed < 0 ? undefined : seed,
      temperature,
      max_tokens: maxTokens < 0 ? undefined : maxTokens,
      stop: stop.length > 0 ? stop : undefined,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stream,
      response_format: jsonMode ? { type: "json_object" } : undefined,
    },
    {
      signal,
    }
  );
};

async function copyToClipboard(textToCopy: string) {
  // Navigator clipboard api needs a secure context (https)
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(textToCopy);
  } else {
    // Use the 'out of viewport hidden text area' trick
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;

    // Move textarea out of the viewport so it's not visible
    textArea.style.position = "absolute";
    textArea.style.left = "-999999px";

    document.body.prepend(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
    } catch (error) {
      console.error(error);
    } finally {
      textArea.remove();
    }
  }
}

const reactMarkdownComponents = (theme) => ({
  h1: (props: any) => {
    const { children, ...rest } = props;
    return <h1 className="text-2xl font-bold">{children}</h1>;
  },
  h2: (props: any) => {
    const { children, ...rest } = props;
    return <h2 className="text-xl font-bold">{children}</h2>;
  },
  h3: (props: any) => {
    const { children, ...rest } = props;
    return <h3 className="text-lg font-bold">{children}</h3>;
  },
  // list
  ul: (props: any) => {
    const { children, ...rest } = props;
    return <ul className="list-disc pl-8 inline-flex flex-col">{children}</ul>;
  },
  ol: (props: any) => {
    const { children, ...rest } = props;
    return (
      <ol className="list-decimal pl-8 inline-flex flex-col">{children}</ol>
    );
  },
  li: (props: any) => {
    const { children, ...rest } = props;
    return <li>{children}</li>;
  },
  // links
  a: (props: any) => {
    const { children, ...rest } = props;
    return (
      <a className="text-blue-500 hover:underline cursor-pointer" {...rest}>
        {children}
      </a>
    );
  },
  // tables
  table: (props: any) => {
    const { children, ...rest } = props;
    return <table className="w-full">{children}</table>;
  },
  thead: (props: any) => {
    const { children, ...rest } = props;
    return (
      <thead className="text-slate-500 dark:text-slate-400">{children}</thead>
    );
  },

  // code
  code: (props: any) => {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");
    const copyText = String(children).replace(/\n$/, "");

    return (
      <>
        {match ? (
          <span className="block">
            <SyntaxHighlighter
              style={theme}
              {...rest}
              PreTag="div"
              language={match[1]}
              wrapLines
              wrapLongLines
            >
              {copyText}
            </SyntaxHighlighter>
          </span>
        ) : (
          <code
            {...rest}
            className={className || "font-bold whitespace-pre-wrap"}
          >
            {children}
          </code>
        )}
      </>
    );
  },
});

type Settings = {
  model: string;
  seed: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  stop: string[];
  jsonMode: boolean;
  stream: boolean;
};

const INITIAL_SETTINGS: Settings = {
  model: "gpt-3.5-turbo",
  seed: -1,
  temperature: 0.5,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: -1,
  stop: [],
  jsonMode: false,
  stream: true,
};

const INITIAL_TOOLS: ChatCompletionTool[] = [
  // {
  //   type: "function",
  //   function: {
  //     name: "User",
  //     description: "User record",
  //     parameters: {
  //       type: "object",
  //       properties: {
  //         name: { type: "string" },
  //         age: { type: "number" },
  //       },
  //       required: ["name", "age"],
  //     },
  //   },
  // },
];

const INITIAL_TOOL_CHOICE: ChatCompletionToolChoiceOption = "auto";

const INITIAL_MESSAGES: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant" },
  { role: "user", content: "" },
  // { role: "user", content: "What is the capital of France?" },
  // { role: "assistant", content: "Paris is the capital of France." },
  // {
  //   role: "user",
  //   content: [
  //     {
  //       type: "text",
  //       text: "What does this image say?",
  //     },
  //     {
  //       type: "image_url",
  //       image_url: {
  //         url: "https://user-images.githubusercontent.com/1991296/230134379-7181e485-c521-4d23-a0d6-f7b3b61ba524.png",
  //       },
  //     },
  //   ],
  // },
  // {
  //   role: "assistant",
  //   content: "The image says llama c++",
  // },
  // {
  //   role: "user",
  //   content: "Extract Jason is 30 years old.",
  // },
  // {
  //   role: "assistant",
  //   content: null,
  //   tool_calls: [
  //     {
  //       id: "call__0_User_cmpl-9dce87d7-1e16-4e40-b096-37ba7ae17dce",
  //       type: "function",
  //       function: {
  //         name: "User",
  //         arguments: '{ "name": "Jason", "age": 30 }',
  //       },
  //     },
  //   ],
  //   function_call: {
  //     name: "User",
  //     arguments: '{ "name": "Jason", "age": 30 }',
  //   },
  // },
  // {
  //   role: "user",
  //   content: "What is the capital of France and Germany?",
  // },
  // {
  //   role: "assistant",
  //   content: null,
  //   tool_calls: [
  //     {
  //       id: "call__0_get_capital_cmpl-9dce87d7-1e16-4e40-b096-37ba7ae17dce",
  //       type: "function",
  //       function: {
  //         name: "get_capital",
  //         arguments: '{ "country": "France" }',
  //       },
  //     },
  //     {
  //       id: "call__1_get_capital_cmpl-9dce87d7-1e16-4e40-b096-37ba7ae17dce",
  //       type: "function",
  //       function: {
  //         name: "get_capital",
  //         arguments: '{ "country": "Germany" }',
  //       },
  //     },
  //   ],
  // },
  // {
  //   role: "user",
  //   content: "What is the capital of France and Germany?",
  // },
  // {
  //   role: "assistant",
  //   function_call: {
  //     name: "get_capital",
  //     arguments: '{ "country": "France" }',
  //   },
  // },
];

const ROLES: ChatCompletionRole[] = ["system", "user", "assistant"];

const useLocalStorage = <T,>({
  key,
  initialValue,
  serialize,
  deserialize,
}: {
  key: string;
  initialValue: T;
  serialize: (value: T) => string;
  deserialize: (value: string) => T;
}) => {
  const current = localStorage.getItem(key);
  if (current === null) {
    localStorage.setItem(key, serialize(initialValue));
  }
  const [value, setValue] = useState<T>(
    current ? deserialize(current) : initialValue
  );
  const save = useCallback(() => {
    localStorage.setItem(key, serialize(value));
  }, [key, value, serialize]);
  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);
  const reload = useCallback(() => {
    const item = localStorage.getItem(key);
    if (item) {
      setValue(deserialize(item));
    } else {
      setValue(initialValue);
    }
  }, [key, initialValue, deserialize]);
  return { value, setValue, save, reset, reload };
};

const useLocalStorageString = (key: string, initialValue: string) => {
  return useLocalStorage({
    key,
    initialValue,
    serialize: (value) => value,
    deserialize: (value) => value,
  });
};

interface ErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Example "componentStack":
    //   in ComponentThatThrows (created by App)
    //   in ErrorBoundary (created by App)
    //   in div (created by App)
    //   in App
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const ResizeableTextarea = (props: any) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (textAreaRef.current && props.autoFocus) {
      textAreaRef.current.focus();
    }
  }, [textAreaRef, props.autoFocus]);
  useEffect(() => {
    if (textAreaRef.current) {
      const target = textAreaRef.current;
      target.style.height = "0px";
      const height = target.scrollHeight;
      target.style.height = `${height}px`;
    }
  });
  return <textarea ref={textAreaRef} rows={1} {...props} />;
};

const ContentArea = ({
  role, // TODO: should probably just be placeholder
  value,
  onChange,
  autoFocus = false,
}: {
  role: ChatCompletionRole;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) => {
  const [editing, setEditing] = useState(autoFocus || false);
  const { theme } = useTheme();
  return (
    <>
      {editing ? (
        <ResizeableTextarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
          }}
          placeholder={`Enter a ${role} message here.`}
          className="disabled:hidden block w-full text-left p-1 px-2 sm:p-2 whitespace-pre-wrap focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 border-none outline-none focus:border-none rounded-lg resize-none group-hover:bg-white dark:group-hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 bg-transparent"
          autoFocus
          onBlur={() => {
            setEditing(false);
          }}
        />
      ) : (
        <button
          onClick={() => {
            setEditing(true);
          }}
          className="text-left p-1 px-2 sm:p-2 group-hover:bg-white dark:group-hover:bg-slate-900 rounded-lg cursor-text w-full"
        >
          {value ? (
            <Markdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={reactMarkdownComponents(
                theme === "dark" ? dark : light
              )}
              className="whitespace-pre-wrap overflow-x-auto flex flex-col gap-2"
            >
              {value}
            </Markdown>
          ) : (
            <div className="text-slate-400 dark:text-slate-500">
              {`Enter a ${role} message here.`}
            </div>
          )}
        </button>
      )}
    </>
  );
};

const ImageEdit = ({
  url,
  setUrl,
  deleteImage,
}: {
  url: string;
  setUrl: (url: string) => void;
  deleteImage: () => void;
}) => {
  const [editing, setEditing] = useState(url === "");
  useEffect(() => {
    document.onpaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const index in items) {
        const item = items[index];
        if (item.kind === "file") {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = function (event) {
            setUrl(event.target?.result as string);
            setEditing(false);
          }; // data url!
          if (blob) {
            reader.readAsDataURL(blob);
          }
        }
      }
    };
  }, [url, setUrl]);
  useEffect(() => {
    if (url === "") {
      setEditing(true);
    }
  }, [url, setEditing]);
  return (
    <>
      {!editing ? (
        <div className="w-full h-full relative px-2 group">
          <div className="absolute top-0 right-0 px-2 group-hover:opacity-100 opacity-20">
            <button
              className="text-white z-50 bg-black p-4"
              onClick={() => {
                setEditing(true);
                // setUrl("");
              }}
            >
              <Pencil className="w-5 h-5" />
            </button>
            <button
              className="text-white z-50 bg-black p-4"
              onClick={() => {
                deleteImage();
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" />
        </div>
      ) : (
        <div className="flex items-center">
          {/* url input */}
          <input
            type="text"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter image URL or paste image here."
            autoFocus={true}
          />
          {/* file input */}
          <label className="p-2 cursor-pointer">
            <Paperclip className="w-5 h-5 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300" />
            <input
              type="file"
              hidden={true}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // check file is (png, jpg, jpeg, webp, or gif)
                const validImageTypes = [
                  "image/png",
                  "image/jpeg",
                  "image/jpg",
                  "image/webp",
                  "image/gif",
                ];
                if (file && validImageTypes.includes(file.type)) {
                  // create base64 data url
                  const reader = new FileReader();
                  reader.onload = function (event) {
                    setUrl(event.target?.result as string);
                    setEditing(false);
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </label>
          {url && (
            <button
              onClick={() => {
                setEditing(false);
              }}
              className="p-2 dark:text-slate-400 dark:hover:text-slate-300"
            >
              <Check className="w-5 h-5" />
            </button>
          )}
          {/* delete button */}
          <button
            onClick={() => {
              deleteImage();
            }}
            className="p-2 dark:text-slate-400 dark:hover:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
};

const ChatMessage = ({
  message,
  setMessage,
  deleteMessage,
}: {
  message: ChatCompletionMessageParam;
  setMessage: (message: ChatCompletionMessageParam) => void;
  deleteMessage: () => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();
  return (
    <div
      ref={rootRef}
      className="flex flex-col sm:flex-row w-full gap-1 sm:gap-2 group hover:bg-slate-200 dark:hover:bg-slate-800 p-1 py-2 sm:p-4 rounded-lg items-baseline grow flex-1"
    >
      <div className="w-full sm:w-28 flex justify-between pr-1">
        <button
          onClick={() => {
            const newMessage = { ...message };
            newMessage.role =
              ROLES[(ROLES.indexOf(newMessage.role) + 1) % ROLES.length];
            setMessage(newMessage);
          }}
          title="Change role"
          className="uppercase font-bold text-left group-hover:bg-slate-300 dark:group-hover:bg-slate-700 p-1 px-2 sm:p-2 rounded-lg text-sm"
        >
          {message.role}
        </button>
        <button
          onClick={deleteMessage}
          className="block sm:hidden"
          title="Delete message"
        >
          <MinusCircle className="w-5 h-5 text-slate-400 dark:text-slate-600" />
        </button>
      </div>
      <span className="flex-1 w-full sm:w-auto h-full min-h-fit overflow-x-auto p-1">
        <div className="flex flex-col w-full flex-1">
          {/* simple text content */}
          {typeof message.content === "string" && (
            <ContentArea
              role={message.role}
              value={message.content}
              onChange={(value) => {
                const newMessage = { ...message, content: value };
                setMessage(newMessage);
              }}
              autoFocus={message.role === "user" && message.content === ""}
            />
          )}

          {/* tools */}
          {message.role === "assistant" &&
            message.tool_calls &&
            message.tool_calls.length > 0 && (
              <ul className="flex flex-col gap-4 py-2">
                {message.tool_calls.map((toolCall, index) => (
                  <li
                    key={index}
                    className="flex flex-col ring ring-slate-200 rounded-lg group-hover:ring-slate-300 dark:group-hover:ring-slate-600 dark:ring-slate-700 bg-white dark:bg-slate-900 focus-within:group-hover:ring-emerald-600 focus-within:ring-emerald-600 focus-within:ring-1 sm:focus-within:ring-2 overflow-hidden"
                  >
                    <div className="flex justify-between gap-2 bg-slate-10 border-b border-slate-300 dark:border-slate-700">
                      <input
                        type="text"
                        placeholder="Enter selected tool name here."
                        className="pl-2 p-1 bg-transparent border-none focus:border-none focus:ring-0 flex-1"
                        value={toolCall.function.name}
                        onChange={(e) => {
                          const newMessage = {
                            ...message,
                            tool_calls: message.tool_calls?.map((t, idx) =>
                              idx === index
                                ? {
                                    ...t,
                                    function: {
                                      ...t.function,
                                      name: e.target.value,
                                    },
                                  }
                                : t
                            ),
                          };
                          setMessage(newMessage);
                        }}
                        autoFocus={toolCall.function.name === ""}
                      />
                      <button
                        title="Delete tool call"
                        onClick={() => {
                          const newMessage = {
                            ...message,
                            tool_calls: message.tool_calls?.filter(
                              (t, idx) => idx !== index
                            ),
                          };
                          setMessage(newMessage);
                        }}
                        className="p-2"
                      >
                        <X className="w-5 h-5 text-slate-400 sm:text-slate-400 hover:text-slate-600 group-hover:text-slate-600 dark:hover:text-slate-400 dark:group-hover:text-slate-400" />
                      </button>
                    </div>
                    <CodeMirror
                      basicSetup={{
                        lineNumbers: false,
                        foldGutter: false,
                        highlightActiveLine: false,
                        highlightSelectionMatches: false,
                      }}
                      className="bg-white dark:bg-slate-800 border border-transparent bg-transparent text-base"
                      extensions={[json()]}
                      placeholder="Enter selected tool call arguments here."
                      value={toolCall.function.arguments}
                      theme={theme === "dark" ? "dark" : "light"}
                      onChange={(value) => {
                        const newMessage = {
                          ...message,
                          tool_calls: message.tool_calls?.map((t, idx) =>
                            idx === index
                              ? {
                                  ...t,
                                  function: {
                                    ...t.function,
                                    arguments: value,
                                  },
                                }
                              : t
                          ),
                        };
                        setMessage(newMessage);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          {message.role === "assistant" && (
            <div className="py-1 flex">
              {!message.content && message.content !== "" && (
                <button
                  title="Add text content"
                  className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center font-bold text-slate-400 dark:text-slate-600 sm:text-transparent dark:sm:text-transparent group-hover:text-slate-800 dark:group-hover:text-slate-400"
                  onClick={() => {
                    const newMessage = {
                      ...message,
                      content: "",
                    };
                    setMessage(newMessage);
                  }}
                >
                  <Type className="w-5 h-5" />
                </button>
              )}
              <button
                title="Add tool call"
                className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center font-bold text-slate-400 dark:text-slate-600 sm:text-transparent dark:sm:text-transparent group-hover:text-slate-800 dark:group-hover:text-slate-400"
                onClick={() => {
                  const newMessage = {
                    ...message,
                    tool_calls: (message.tool_calls || []).concat([
                      {
                        id: `tool_call_${message.tool_calls?.length || 0}`,
                        type: "function",
                        function: {
                          name: "",
                          arguments: "",
                        },
                      },
                    ]),
                  };
                  setMessage(newMessage);
                }}
              >
                <Wrench className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* multi-content */}
          {message.role === "user" &&
            message.content &&
            Array.isArray(message.content) && (
              <ul className="flex flex-col w-full gap-4">
                {message.content.map((item, index) => (
                  <li key={index}>
                    {item.type === "text" ? (
                      <ContentArea
                        role={message.role}
                        value={item.text}
                        onChange={(value) => {
                          if (typeof message.content === "string") return;
                          const newMessage = {
                            ...message,
                            content: message.content.map((c, idx) =>
                              idx === index ? { ...c, text: value } : c
                            ),
                          };
                          setMessage(newMessage);
                        }}
                      />
                    ) : (
                      <>
                        <ImageEdit
                          url={item.image_url.url}
                          setUrl={(url: string) => {
                            if (typeof message.content === "string") return;
                            const newMessage = {
                              ...message,
                              content: message.content.map((c, idx) =>
                                idx === index ? { ...c, image_url: { url } } : c
                              ),
                            };
                            setMessage(newMessage);
                          }}
                          deleteImage={() => {
                            if (typeof message.content === "string") return;
                            const newMessage = {
                              ...message,
                              content: message.content.filter(
                                (c, idx) => idx !== index
                              ),
                            };
                            setMessage(newMessage);
                          }}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          {message.role === "user" && (
            <div className="flex py-1">
              {(typeof message.content === "string" ||
                !(
                  Array.isArray(message.content) &&
                  message.content.find((c) => c.type === "image_url")
                )) && (
                <button
                  title="Add image content"
                  className="p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center justify-center font-bold text-slate-400 dark:text-slate-600 sm:text-transparent dark:sm:text-transparent group-hover:text-slate-800 dark:group-hover:text-slate-400"
                  onClick={() => {
                    const newMessage = {
                      ...message,
                      content: Array.isArray(message.content)
                        ? message.content.concat([
                            {
                              type: "image_url" as const,
                              image_url: { url: "" },
                            },
                          ])
                        : [
                            { type: "text" as const, text: message.content },
                            {
                              type: "image_url" as const,
                              image_url: { url: "" },
                            },
                          ],
                    };
                    setMessage(newMessage);
                  }}
                >
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </div>
      </span>
      <button onClick={deleteMessage} className="w-4 hidden sm:block">
        <MinusCircle className="w-4 h-4 text-transparent group-hover:text-slate-600 dark:group-hover:text-slate-400" />
      </button>
    </div>
  );
};

const CopyButton = ({ value }: { value: string | (() => string) }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const timeout = setTimeout(() => {
        setCopied(false);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [copied]);
  return (
    <button
      className="focus:outline-none"
      onClick={async () => {
        setCopied(true);
        await copyToClipboard(typeof value === "function" ? value() : value);
      }}
      title="Copy to clipboard"
    >
      {copied ? (
        <ClipboardCheck className="w-5 h-5" />
      ) : (
        <Clipboard className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
      )}
    </button>
  );
};

const SettingsDialog = ({
  settingsOpen,
  setSettingsOpen,
}: {
  settingsOpen: boolean;
  setSettingsOpen: (settingsOpen: boolean) => void;
}) => {
  const apiKey = useLocalStorageString("apiKey", "");
  const baseURL = useLocalStorageString("baseURL", "");

  const baseURLRef = useRef<HTMLInputElement | null>(null);

  return (
    <Dialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      className="relative z-50"
      initialFocus={baseURLRef}
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg p-4 border max-w-none sm:max-w-xl w-full gap-2 bg-white dark:bg-slate-900 max-h-full flex flex-col">
          <div>
            <div className="w-full flex justify-between">
              <Dialog.Title className="font-bold text-lg">
                Settings
              </Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500 dark:text-slate-400">
              Configure settings for the chat playground.
            </Dialog.Description>
          </div>

          <div className="flex flex-col gap-4 py-4 pb-8">
            {/* base url */}
            <div className="w-full">
              <label
                htmlFor="base-url"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Base URL
              </label>
              <input
                value={baseURL.value}
                onChange={(e) => baseURL.setValue(e.target.value)}
                type="url"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Enter the base URL for the server or leave blank for OpenAI"
                ref={baseURLRef}
              />
            </div>
            {/* api key */}
            <div className="w-full">
              <label
                htmlFor="api-key"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                API Key
              </label>
              <input
                value={apiKey.value}
                onChange={(e) => apiKey.setValue(e.target.value)}
                type="password"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Enter the API key for the OpenAI API"
              />
            </div>
          </div>
          <button
            className="p-2 px-4 w-full sm:w-auto rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
            onClick={() => {
              apiKey.save();
              baseURL.save();
              setSettingsOpen(false);
            }}
          >
            Save
          </button>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

const SamplingSettings = ({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
}) => {
  const [model, setModel] = useState(settings.model);
  const modelId = useId();
  const [seed, setSeed] = useState(settings.seed);
  const seedId = useId();
  const [temperature, setTemperature] = useState(settings.temperature);
  const temperatureId = useId();
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens);
  const maxTokensId = useId();
  const [topP, setTopP] = useState(settings.topP);
  const topPId = useId();
  const [presencePenalty, setPresencePenalty] = useState(
    settings.presencePenalty
  );
  const presencePenaltyId = useId();
  const [frequencyPenalty, setFrequencyPenalty] = useState(
    settings.frequencyPenalty
  );
  const frequencyPenaltyId = useId();
  const [jsonMode, setJsonMode] = useState(settings.jsonMode);
  const jsonModeId = useId();
  const [stopSequence, setStopSequence] = useState<string>("");
  const stopSequenceId = useId();
  const [stop, setStop] = useState<string[]>(settings.stop);
  const stopId = useId();
  const [stream, setStream] = useState(settings.stream);
  const streamId = useId();

  const saveSettingsButtonRef = useRef<HTMLButtonElement | null>(null);

  const save = () => {
    const newSettings = {
      model,
      seed,
      temperature,
      maxTokens,
      topP,
      presencePenalty,
      frequencyPenalty,
      jsonMode,
      stop,
      stream,
    };
    setSettings(newSettings);
  };

  const reset = () => {
    setModel(settings.model);
    setSeed(settings.seed);
    setTemperature(settings.temperature);
    setMaxTokens(settings.maxTokens);
    setTopP(settings.topP);
    setPresencePenalty(settings.presencePenalty);
    setFrequencyPenalty(settings.frequencyPenalty);
    setJsonMode(settings.jsonMode);
    setStop(settings.stop);
    setStream(settings.stream);
  };

  return (
    <div className="w-full h-full p-4 gap-2 flex flex-col">
      <div>
        <div className="flex justify-between">
          <div className="font-bold text-lg">Parameters</div>
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Configure parameters for chat completion requests.
        </p>
      </div>
      <div className="flex flex-col gap-4 py-4 overflow-y-auto px-2 -mx-2">
        {/* model */}
        <div className="w-full">
          <label
            htmlFor={modelId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Model
          </label>
          <input
            id={modelId}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            type="text"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Model name"
          />
        </div>
        {/* seed */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={seedId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Seed
          </label>
          <input
            id={seedId}
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Seed value. Enter -1 for random."
          />
        </div>
        {/* temperature */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={temperatureId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Temperature
          </label>
          <input
            id={temperatureId}
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Sampling temperature. Enter 0 for deterministic decoding."
          />
        </div>
        {/* Top P */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={topPId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Top P
          </label>
          <input
            id={topPId}
            value={topP}
            onChange={(e) => setTopP(parseFloat(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Enter the top p for the OpenAI API"
          />
        </div>
        {/* Frequency Penalty */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={frequencyPenaltyId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Frequency Penalty
          </label>
          <input
            id={frequencyPenaltyId}
            value={frequencyPenalty}
            onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Enter the frequency penalty for the OpenAI API"
          />
        </div>
        {/* Presence Penalty */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={presencePenaltyId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Presence Penalty
          </label>
          <input
            id={presencePenaltyId}
            value={presencePenalty}
            onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Enter the presence penalty for the OpenAI API"
          />
        </div>
        {/* max tokens */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={maxTokensId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Max Tokens
          </label>
          <input
            id={maxTokensId}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
            type="number"
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            placeholder="Maximum number of tokens to generate. Enter -1 for no limit."
          />
        </div>
        {/* stop */}
        <div className="w-full flex flex-col gap-2">
          <label
            // htmlFor={stopId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Stop Sequences
          </label>
          <div className="flex">
            <form
              // id={stopId}
              onSubmit={(e) => {
                e.preventDefault();
                if (stopSequence === "") {
                  return;
                }
                // check if stopSequence already in stop
                if (stop.includes(stopSequence)) {
                  return;
                }
                setStop([...stop, stopSequence]);
                setStopSequence("");
              }}
              className="flex w-full gap-2"
            >
              <input
                value={stopSequence}
                onChange={(e) => setStopSequence(e.target.value)}
                type="text"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Stop sequence used to stop generation."
              />
              <button
                type="submit"
                disabled={stopSequence === ""}
                className="p-1 sm:p-2 focus:outline-none focus:ring-none rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 disabled:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-400"
              >
                <Plus className="w-5 h-5" />
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-1">
            {stop.map((stopSequence, index) => (
              <div
                key={index}
                className="text-slate-800 bg-slate-200 rounded-lg text-sm dark:text-slate-400 dark:bg-slate-700"
              >
                <button
                  onClick={() => {
                    if (stop) {
                      setStop(stop.filter((_, i) => i !== index));
                    }
                  }}
                  className="p-1 sm:p-2 focus:ring-none rounded-lg border border-none focus:border-none flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-400"
                >
                  {stopSequence}
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {/* JSON Mode */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={jsonModeId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            JSON Mode
          </label>
          <div className="flex items-center gap-2">
            <input
              id={jsonModeId}
              checked={jsonMode}
              onChange={(e) => setJsonMode(e.target.checked)}
              type="checkbox"
              className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:checked:bg-emerald-600"
              placeholder="Enter the model for the OpenAI API"
            />
            <label htmlFor={jsonModeId} className="text-sm">
              Enabled
            </label>
          </div>
        </div>
        {/* Stream */}
        <div className="w-full flex flex-col gap-2">
          <label
            htmlFor={streamId}
            className="text-slate-800 dark:text-slate-400 text-sm font-bold"
          >
            Stream
          </label>
          <div className="flex items-center gap-2">
            <input
              id={streamId}
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
              type="checkbox"
              className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:checked:bg-emerald-600"
            />
            <label htmlFor={streamId} className="text-sm">
              Enabled
            </label>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          className="p-2 px-4 w-full sm:w-auto rounded-lg disabled:bg-slate-200 disabled:text-slate-800 bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
          onClick={() => {
            save();
          }}
          ref={saveSettingsButtonRef}
          disabled={
            model === settings.model &&
            seed === settings.seed &&
            temperature === settings.temperature &&
            maxTokens === settings.maxTokens &&
            topP === settings.topP &&
            presencePenalty === settings.presencePenalty &&
            frequencyPenalty === settings.frequencyPenalty &&
            jsonMode === settings.jsonMode &&
            stop.length === settings.stop.length &&
            stop.every(
              (stopSequence, index) => stopSequence === settings.stop[index]
            ) &&
            stream === settings.stream
          }
        >
          Save
        </button>
        <button
          className="p-2 px-4 w-full sm:w-auto rounded-lg disabled:bg-slate-100 disabled:text-slate-400 bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 focus:outline-none"
          onClick={() => {
            reset();
          }}
          disabled={
            model === settings.model &&
            seed === settings.seed &&
            temperature === settings.temperature &&
            maxTokens === settings.maxTokens &&
            topP === settings.topP &&
            presencePenalty === settings.presencePenalty &&
            frequencyPenalty === settings.frequencyPenalty &&
            jsonMode === settings.jsonMode &&
            stop.length === settings.stop.length &&
            stop.every(
              (stopSequence, index) => stopSequence === settings.stop[index]
            ) &&
            stream === settings.stream
          }
        >
          Reset
        </button>
      </div>
    </div>
  );
};

const SamplingSettingsDialog = ({
  settings,
  setSettings,
  settingsOpen,
  setSettingsOpen,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  settingsOpen: boolean;
  setSettingsOpen: (settingsOpen: boolean) => void;
}) => {
  const [model, setModel] = useState(settings.model);
  const modelId = useId();
  const modelRef = useRef<HTMLInputElement | null>(null);
  const [seed, setSeed] = useState(settings.seed);
  const seedId = useId();
  const [temperature, setTemperature] = useState(settings.temperature);
  const temperatureId = useId();
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens);
  const maxTokensId = useId();
  const [topP, setTopP] = useState(settings.topP);
  const topPId = useId();
  const [presencePenalty, setPresencePenalty] = useState(
    settings.presencePenalty
  );
  const presencePenaltyId = useId();
  const [frequencyPenalty, setFrequencyPenalty] = useState(
    settings.frequencyPenalty
  );
  const frequencyPenaltyId = useId();
  const [jsonMode, setJsonMode] = useState(settings.jsonMode);
  const jsonModeId = useId();
  const [stopSequence, setStopSequence] = useState<string>("");
  const stopSequenceId = useId();
  const [stop, setStop] = useState<string[]>(settings.stop);
  const stopId = useId();
  const [stream, setStream] = useState(settings.stream);
  const streamId = useId();

  const saveSettingsButtonRef = useRef<HTMLButtonElement | null>(null);

  const save = () => {
    const newSettings = {
      model,
      seed,
      temperature,
      maxTokens,
      topP,
      presencePenalty,
      frequencyPenalty,
      jsonMode,
      stop,
      stream,
    };
    setSettings(newSettings);
  };

  return (
    <Dialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      className="relative z-50"
      initialFocus={modelRef}
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg border max-w-none sm:max-w-xl w-full bg-white dark:bg-slate-900 p-4 gap-2 flex flex-col max-h-dvh">
          <div>
            <div className="flex justify-between">
              <Dialog.Title className="font-bold text-lg">
                Parameters
              </Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500 dark:text-slate-400">
              Configure parameters for chat completion requests.
            </Dialog.Description>
          </div>
          <div className="flex flex-col gap-4 py-4 overflow-y-auto px-2 -mx-2">
            {/* model */}
            <div className="w-ful">
              <label
                htmlFor={modelId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Model
              </label>
              <input
                id={modelId}
                value={model}
                ref={modelRef}
                onChange={(e) => setModel(e.target.value)}
                type="text"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Model name"
              />
            </div>
            {/* seed */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={seedId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Seed
              </label>
              <input
                id={seedId}
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-7000 dark:bg-slate-900"
                placeholder="Seed value. Enter -1 for random."
              />
            </div>
            {/* temperature */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={temperatureId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Temperature
              </label>
              <input
                id={temperatureId}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Sampling temperature. Enter 0 for deterministic decoding."
              />
            </div>
            {/* Top P */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={topPId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Top P
              </label>
              <input
                id={topPId}
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Enter the top p for the OpenAI API"
              />
            </div>
            {/* Frequency Penalty */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={frequencyPenaltyId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Frequency Penalty
              </label>
              <input
                id={frequencyPenaltyId}
                value={frequencyPenalty}
                onChange={(e) =>
                  setFrequencyPenalty(parseFloat(e.target.value))
                }
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Enter the frequency penalty for the OpenAI API"
              />
            </div>
            {/* Presence Penalty */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={presencePenaltyId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Presence Penalty
              </label>
              <input
                id={presencePenaltyId}
                value={presencePenalty}
                onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Enter the presence penalty for the OpenAI API"
              />
            </div>
            {/* max tokens */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={maxTokensId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Max Tokens
              </label>
              <input
                id={maxTokensId}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                placeholder="Maximum number of tokens to generate. Enter -1 for no limit."
              />
            </div>
            {/* stop */}
            <div className="w-full flex flex-col gap-2">
              <label
                // htmlFor={stopId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Stop Sequences
              </label>
              <div className="flex">
                <form
                  // id={stopId}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (stopSequence === "") {
                      return;
                    }
                    // check if stopSequence already in stop
                    if (stop.includes(stopSequence)) {
                      return;
                    }
                    setStop([...stop, stopSequence]);
                    setStopSequence("");
                  }}
                  className="flex w-full gap-2"
                >
                  <input
                    value={stopSequence}
                    onChange={(e) => setStopSequence(e.target.value)}
                    type="text"
                    className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                    placeholder="Stop sequence used to stop generation."
                  />
                  <button
                    type="submit"
                    disabled={stopSequence === ""}
                    className="p-1 sm:p-2 focus:outline-none focus:ring-none rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 disabled:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-400"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
              <div className="flex flex-wrap gap-1">
                {stop.map((stopSequence, index) => (
                  <div
                    key={index}
                    className="text-slate-800 bg-slate-200 rounded-lg text-sm dark:text-slate-400 dark:bg-slate-700"
                  >
                    <button
                      onClick={() => {
                        if (stop) {
                          setStop(stop.filter((_, i) => i !== index));
                        }
                      }}
                      className="p-1 sm:p-2 focus:ring-none rounded-lg border border-none focus:border-none flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-400"
                    >
                      {stopSequence}
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* JSON Mode */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={jsonModeId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                JSON Mode
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={jsonModeId}
                  checked={jsonMode}
                  onChange={(e) => setJsonMode(e.target.checked)}
                  type="checkbox"
                  className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:checked:bg-emerald-600"
                  placeholder="Enter the model for the OpenAI API"
                />
                <label htmlFor={jsonModeId} className="text-sm">
                  Enabled
                </label>
              </div>
            </div>
            {/* Stream */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor={streamId}
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Stream
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={streamId}
                  checked={stream}
                  onChange={(e) => setStream(e.target.checked)}
                  type="checkbox"
                  className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-700 dark:checked:bg-emerald-600"
                />
                <label htmlFor={streamId} className="text-sm">
                  Enabled
                </label>
              </div>
            </div>
          </div>
          <div>
            <button
              className="p-2 px-4 w-full sm:w-auto rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
              onClick={() => {
                save();
                setSettingsOpen(false);
              }}
              ref={saveSettingsButtonRef}
            >
              Save
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

const ToolSettings = ({
  tools,
  setTools,
  toolChoice,
  setToolChoice,
}: {
  tools: ChatCompletionTool[];
  setTools: (tools: ChatCompletionTool[]) => void;
  toolChoice: ChatCompletionToolChoiceOption;
  setToolChoice: (toolChoice: ChatCompletionToolChoiceOption) => void;
}) => {
  const [currentToolChoice, setCurrentToolChoice] =
    useState<ChatCompletionToolChoiceOption>(toolChoice);
  const [currentTools, setCurrentTools] = useState<
    { name: string; description: string; parameters: string }[]
  >(
    tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      parameters: JSON.stringify(tool.function.parameters, null, 2) ?? "",
    }))
  );
  const { theme } = useTheme();
  const saveToolSettings = () => {
    const tools_parsed = currentTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: JSON.parse(tool.parameters),
      },
    }));
    setTools(tools_parsed);
    setToolChoice(currentToolChoice);
  };
  useEffect(() => {
    setCurrentTools(
      tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description ?? "",
        parameters: JSON.stringify(tool.function.parameters, null, 2) ?? "",
      }))
    );
  }, [tools]);
  useEffect(() => {
    setCurrentToolChoice(toolChoice);
  }, [toolChoice]);
  const reset = () => {
    setCurrentTools(
      tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description ?? "",
        parameters: JSON.stringify(tool.function.parameters, null, 2) ?? "",
      }))
    );
    setCurrentToolChoice(toolChoice);
  };

  return (
    <>
      <div className="w-full h-full p-4 gap-2 flex flex-col">
        <div>
          <div className="flex justify-between">
            <h1 className="font-bold text-lg">Tools</h1>
          </div>
          <p className="text-slate-500">Configure tools.</p>
        </div>
        <div className="flex flex-col gap-4 py-4 overflow-y-auto px-2 -mx-2">
          <div className="flex flex-col gap-2">
            <label className="text-slate-800 dark:text-slate-400 text-sm font-bold">
              Tool Choice
            </label>
            <select
              value={
                typeof currentToolChoice === "string"
                  ? currentToolChoice
                  : `tool:${currentToolChoice.function.name}`
              }
              onChange={(e) => {
                if (e.target.value.startsWith("tool:")) {
                  setCurrentToolChoice({
                    type: "function",
                    function: {
                      name: e.target.value.split(":")[1],
                    },
                  });
                } else {
                  if (e.target.value === "auto") {
                    setCurrentToolChoice("auto");
                  } else {
                    setCurrentToolChoice("none");
                  }
                }
              }}
              className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
            >
              <option value="auto">Auto</option>
              <option value="none">None</option>
              {currentTools.map((tool) => (
                <option key={tool.name} value={`tool:${tool.name}`}>
                  Tool: {tool.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-slate-800 dark:text-slate-400 text-sm font-bold">
              Tools
            </label>
            <ul className="flex flex-col gap-2">
              {currentTools.map((tool, index) => (
                <li
                  key={index}
                  className="focus-within:ring-emerald-600 focus-within:ring-1 sm:focus-within:ring-2 ring-slate-300 dark:ring-slate-700 rounded-lg ring-1 overflow-hidden"
                >
                  <div className="flex flex-col relative">
                    <div className="flex flex-col bg-slate-100 border-b border-slate-300 p-2 dark:bg-slate-900 dark:border-slate-700">
                      <div className="flex justify-between">
                        <input
                          className="border-none focus:ring-0 focus:border-none bg-transparent p-0 flex-1"
                          value={tool.name}
                          onChange={(e) => {
                            setCurrentTools(
                              currentTools.map((t, i) =>
                                i === index
                                  ? {
                                      ...t,
                                      name: e.target.value,
                                    }
                                  : t
                              )
                            );
                          }}
                          placeholder="Tool name"
                          autoFocus={tool.name === ""}
                        />
                        <button
                          onClick={() => {
                            setCurrentTools(
                              currentTools.filter((_, i) => i !== index)
                            );
                          }}
                          className="p-1 bg-transparent border-none focus:border-none focus:ring-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <ResizeableTextarea
                        className="border-none focus:ring-0 focus:border-none resize-none bg-transparent p-0"
                        value={tool.description}
                        onChange={(
                          e: React.ChangeEvent<HTMLTextAreaElement>
                        ) => {
                          setCurrentTools(
                            currentTools.map((t, i) =>
                              i === index
                                ? {
                                    ...t,
                                    description: e.target.value,
                                  }
                                : t
                            )
                          );
                        }}
                        placeholder="Tool description"
                      />
                    </div>
                    <div className="flex flex-col">
                      <code className="whitespace-pre-wrap w-full rounded-lg">
                        <CodeMirror
                          basicSetup={{
                            lineNumbers: false,
                            foldGutter: false,
                            highlightActiveLine: false,
                            highlightSelectionMatches: false,
                          }}
                          className="rounded-lg p-0 bg-white dark:bg-slate-900 text-base"
                          extensions={[json()]}
                          value={tool.parameters}
                          placeholder="Tool parameters (OpenAPI JSON)"
                          theme={theme === "dark" ? "dark" : "light"}
                          onChange={(value) => {
                            setCurrentTools(
                              currentTools.map((t, i) =>
                                i === index ? { ...t, parameters: value } : t
                              )
                            );
                          }}
                        />
                      </code>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <button
              onClick={() =>
                setCurrentTools([
                  ...currentTools,
                  {
                    name: "",
                    description: "",
                    parameters: "{}",
                  },
                ])
              }
              className="px-2 py-1 sm:py-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 w-full font-bold"
            >
              <PlusCircle className="w-5 h-5" />
              Add Tool
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="p-2 px-4 w-full sm:w-auto rounded-lg disabled:bg-slate-200 disabled:text-slate-800 bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
            onClick={() => {
              saveToolSettings();
            }}
            disabled={
              currentTools.length === tools.length &&
              currentTools.every(
                (tool, index) =>
                  tool.name === tools[index].function.name &&
                  tool.description === tools[index].function.description &&
                  tool.parameters ===
                    JSON.stringify(tools[index].function.parameters, null, 2)
              ) &&
              currentToolChoice === toolChoice
            }
          >
            Save
          </button>
          <button
            onClick={reset}
            className="p-2 px-4 w-full sm:w-auto rounded-lg disabled:bg-slate-100 disabled:text-slate-400 bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 focus:outline-none"
            disabled={
              currentTools.length === tools.length &&
              currentTools.every(
                (tool, index) =>
                  tool.name === tools[index].function.name &&
                  tool.description === tools[index].function.description &&
                  tool.parameters ===
                    JSON.stringify(tools[index].function.parameters, null, 2)
              ) &&
              currentToolChoice === toolChoice
            }
          >
            Reset
          </button>
        </div>
      </div>
    </>
  );
};

const ToolSettingsDialog = ({
  tools,
  setTools,
  toolChoice,
  setToolChoice,
  settingsOpen,
  setSettingsOpen,
}: {
  tools: ChatCompletionTool[];
  setTools: (tools: ChatCompletionTool[]) => void;
  toolChoice: ChatCompletionToolChoiceOption;
  setToolChoice: (toolChoice: ChatCompletionToolChoiceOption) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}) => {
  const toolChoiceRef = useRef<HTMLSelectElement | null>(null);
  const [currentTools, setCurrentTools] = useState<
    { name: string; description: string; parameters: string }[]
  >(
    tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      parameters: JSON.stringify(tool.function.parameters, null, 2) ?? "",
    }))
  );
  const saveToolSettings = () => {
    const tools_parsed = currentTools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: JSON.parse(tool.parameters),
      },
    }));
    setTools(tools_parsed);
    setSettingsOpen(false);
  };
  return (
    <Dialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      className="relative z-50"
      initialFocus={toolChoiceRef}
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg border max-w-none sm:max-w-xl w-full bg-white dark:bg-slate-900 p-4 gap-2 flex flex-col max-h-dvh">
          <div>
            <div className="flex justify-between">
              <Dialog.Title className="font-bold text-lg">Tools</Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-400" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500 dark:text-slate-400">
              Configure tools.
            </Dialog.Description>
          </div>
          <div className="flex flex-col gap-4 py-4 overflow-y-auto px-2 -mx-2">
            <div className="flex flex-col gap-2">
              <label className="text-slate-800 dark:text-slate-400 text-sm font-bold">
                Tool Choice
              </label>
              <select
                value={
                  typeof toolChoice === "string"
                    ? toolChoice
                    : `tool:${toolChoice.function.name}`
                }
                onChange={(e) => {
                  if (e.target.value.startsWith("tool:")) {
                    setToolChoice({
                      type: "function",
                      function: {
                        name: e.target.value.split(":")[1],
                      },
                    });
                  } else {
                    if (e.target.value === "auto") {
                      setToolChoice("auto");
                    } else {
                      setToolChoice("none");
                    }
                  }
                }}
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-900"
                ref={toolChoiceRef}
              >
                <option value="auto">Auto</option>
                <option value="none">None</option>
                {currentTools.map((tool) => (
                  <option key={tool.name} value={`tool:${tool.name}`}>
                    Tool: {tool.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-800 dark:text-slate-400 text-sm font-bold">
                Tools
              </label>
              <ul className="flex flex-col gap-2">
                {currentTools.map((tool, index) => (
                  <li
                    key={index}
                    className="focus-within:ring-emerald-600 focus-within:ring-1 sm:focus-within:ring-2 ring-slate-300 dark:ring-slate-700 rounded-lg ring-1 overflow-hidden"
                  >
                    <div className="flex flex-col relative">
                      <div className="flex flex-col bg-slate-100 border-b border-slate-300 p-2 dark:bg-slate-900 dark:border-slate-700">
                        <div className="flex justify-between">
                          <input
                            className="border-none focus:ring-0 focus:border-none bg-transparent p-0 flex-1"
                            value={tool.name}
                            onChange={(e) => {
                              setCurrentTools(
                                currentTools.map((t, i) =>
                                  i === index
                                    ? {
                                        ...t,
                                        name: e.target.value,
                                      }
                                    : t
                                )
                              );
                            }}
                            placeholder="Tool name"
                            autoFocus={tool.name === ""}
                          />
                          <button
                            onClick={() => {
                              setCurrentTools(
                                currentTools.filter((_, i) => i !== index)
                              );
                            }}
                            className="p-1 bg-transparent border-none focus:border-none focus:ring-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <ResizeableTextarea
                          className="border-none focus:ring-0 focus:border-none resize-none bg-transparent p-0"
                          value={tool.description}
                          onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>
                          ) => {
                            setCurrentTools(
                              currentTools.map((t, i) =>
                                i === index
                                  ? {
                                      ...t,
                                      description: e.target.value,
                                    }
                                  : t
                              )
                            );
                          }}
                          placeholder="Tool description"
                        />
                      </div>
                      <div className="flex flex-col">
                        <code className="whitespace-pre-wrap w-full rounded-lg">
                          <CodeMirror
                            basicSetup={{
                              lineNumbers: false,
                              foldGutter: false,
                              highlightActiveLine: false,
                              highlightSelectionMatches: false,
                            }}
                            className="rounded-lg p-0 bg-white dark:bg-slate-800 text-base"
                            extensions={[json()]}
                            value={tool.parameters}
                            placeholder="Tool parameters (OpenAPI JSON)"
                            onChange={(value) => {
                              setCurrentTools(
                                currentTools.map((t, i) =>
                                  i === index ? { ...t, parameters: value } : t
                                )
                              );
                            }}
                          />
                        </code>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setCurrentTools([
                    ...currentTools,
                    {
                      name: "",
                      description: "",
                      parameters: "{}",
                    },
                  ])
                }
                className="px-2 py-1 sm:py-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 w-full font-bold"
              >
                <PlusCircle className="w-5 h-5" />
                Add Tool
              </button>
            </div>
          </div>
          <div>
            <button
              className="p-2 px-4 w-full sm:w-auto rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
              onClick={() => {
                saveToolSettings();
              }}
            >
              Save
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

const getCopyUrl = ({
  messages,
  tools,
  toolChoice,
  settings,
}: {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  toolChoice: ChatCompletionToolChoiceOption;
  settings: Settings;
}) => {
  const baseUrl =
    window.location.protocol +
    "//" +
    window.location.host +
    window.location.pathname;
  let url = `${baseUrl}/?`;
  // copy messages if different than INITIAL_MESSAGES
  if (JSON.stringify(messages) !== JSON.stringify(INITIAL_MESSAGES)) {
    url += `messages=${encodeURIComponent(JSON.stringify(messages))}&`;
  }
  // copy tools if different than INITIAL_TOOLS
  if (JSON.stringify(tools) !== JSON.stringify(INITIAL_TOOLS)) {
    url += `tools=${encodeURIComponent(JSON.stringify(tools))}&`;
  }
  // copy tool choice if different than INITIAL_TOOL_CHOICE
  if (JSON.stringify(toolChoice) !== JSON.stringify(INITIAL_TOOL_CHOICE)) {
    url += `tool_choice=${encodeURIComponent(JSON.stringify(toolChoice))}&`;
  }
  // copy settings if different than INITIAL_SETTINGS
  if (JSON.stringify(settings) !== JSON.stringify(INITIAL_SETTINGS)) {
    url += `settings=${encodeURIComponent(JSON.stringify(settings))}`;
  }
  return url;
};

const ShowScrollToBottom = ({
  elementRef,
  children,
  deps,
}: {
  elementRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  deps?: any[];
}) => {
  const [showScrollButton, setShowScrollButton] = useState(false);
  useEffect(() => {
    const checkScroll = () => {
      if (!elementRef.current) {
        return;
      }
      const distanceToBottom =
        elementRef.current.scrollHeight -
        elementRef.current.scrollTop -
        elementRef.current.clientHeight;
      const isAtBottom = distanceToBottom <= 5;
      const hasScrollBar =
        elementRef.current.scrollHeight > elementRef.current.clientHeight;
      // show scroll button
      setShowScrollButton(hasScrollBar && !isAtBottom);
    };
    checkScroll();
    const container = elementRef.current;
    if (!container) {
      return;
    }
    // scroll events
    container.addEventListener("scroll", () => {
      checkScroll();
    });
    // resize events
    container.addEventListener("resize", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      container.removeEventListener("scroll", checkScroll);
      container.removeEventListener("resize", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [elementRef, deps]);
  return showScrollButton ? <>{children}</> : null;
};

const ErrorToast = ({
  error,
  dismiss,
}: {
  error: Error;
  dismiss: () => void;
}) => {
  return (
    <div className="absolute top-0 left-0 right-0 flex justify-center items-center p-2 pointer-events-none">
      <div className="max-w-full flex gap-2 p-4 bg-red-500 text-white font-bold rounded-lg items-baseline shadow-lg pointer-events-auto">
        <div>Error:</div>
        <div className="flex-1 overflow-auto">{error.message}</div>
        <button onClick={dismiss}>
          <X className="w-5 h-5 -mb-1" />
        </button>
      </div>
    </div>
  );
};

const getInitialMessagesFromParams = (params: URLSearchParams) => {
  const initialMessagesParam = params.get("messages");
  let initialMessages = INITIAL_MESSAGES;
  if (initialMessagesParam) {
    try {
      initialMessages = JSON.parse(initialMessagesParam);
    } catch (error) {
      console.error("Error parsing initialMessages query parameter:", error);
    }
  }
  return initialMessages;
};

const getInitialToolsFromParams = (params: URLSearchParams) => {
  const initialToolsParam = params.get("tools");
  let initialTools = INITIAL_TOOLS;
  if (initialToolsParam) {
    try {
      initialTools = JSON.parse(initialToolsParam);
    } catch (error) {
      console.error("Error parsing initialTools query parameter:", error);
    }
  }
  return initialTools;
};

const getInitialToolChoiceFromParams = (params: URLSearchParams) => {
  const initialToolChoiceParam = params.get("tool_choice");
  let initialToolChoice = INITIAL_TOOL_CHOICE;
  if (initialToolChoiceParam) {
    try {
      initialToolChoice = JSON.parse(initialToolChoiceParam);
    } catch (error) {
      console.error("Error parsing initialToolChoice query parameter:", error);
    }
  }
  return initialToolChoice;
};

const getInitialSettingsFromParams = (params: URLSearchParams) => {
  const initialSettingsParam = params.get("settings");
  let initialSettings = INITIAL_SETTINGS;
  if (initialSettingsParam) {
    try {
      initialSettings = {
        ...initialSettings,
        ...JSON.parse(initialSettingsParam),
      };
    } catch (error) {
      console.error("Error parsing initialSettings query parameter:", error);
    }
  }
  return initialSettings;
};

export default function Home() {
  const queryParams = useSearchParams();
  const [messages, setMessages] = useState(
    getInitialMessagesFromParams(queryParams)
  );
  const [tools, setTools] = useState<ChatCompletionTool[]>(
    getInitialToolsFromParams(queryParams)
  );
  const [toolChoice, setToolChoice] = useState<ChatCompletionToolChoiceOption>(
    getInitialToolChoiceFromParams(queryParams)
  );
  const [settings, setSettings] = useState<Settings>(
    getInitialSettingsFromParams(queryParams)
  );
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [samplingSettingsOpen, setSamplingSettingsOpen] = useState(false);
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [completionMetrics, setCompletionMetrics] = useState<{
    startTime: number;
    endTime: number | null;
    firstTokenTime: number | null;
    latestTokenTime: number | null;
    nTokens: number | null;
  } | null>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const messagesContainerBottomRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const { theme, setTheme } = useTheme();
  const deleteMessage = (index: number) => {
    const newMessages = [...messages];
    newMessages.splice(index, 1);
    setMessages(newMessages);
  };
  const addNewMessage = () => {
    setMessages((messages) => {
      const newMessages = [...messages];
      newMessages.push({ role: "user", content: "" });
      return newMessages;
    });
  };
  const sendMessage = () => {
    setMessages((messages) => [...messages, { role: "assistant" }]);
    const abortController = new AbortController();
    setAbortController(abortController);
    const signal = abortController.signal;
    const now = Date.now();
    setCompletionMetrics({
      startTime: now,
      firstTokenTime: null,
      latestTokenTime: now,
      nTokens: null,
      endTime: null,
    });
    createChatCompletion(messages, settings, tools, toolChoice, { signal })
      .then(async (responseStream) => {
        if (!settings.stream) {
          const response = responseStream as ChatCompletion;
          const content = response.choices[0].message.content;
          if (content) {
            setMessages((messages) => [
              ...messages.slice(0, -1),
              { role: "assistant", content },
            ]);
          }
          const toolCalls = response.choices[0].message.tool_calls;
          if (toolCalls) {
            setMessages((messages) => {
              const lastMessage = messages[
                messages.length - 1
              ] as ChatCompletionMessage;
              let lastMessageToolCalls =
                lastMessage.tool_calls === undefined
                  ? []
                  : lastMessage.tool_calls;
              if (
                toolCalls[0].id !== undefined &&
                lastMessageToolCalls.filter(
                  (toolCall) => toolCall.id === toolCalls[0].id
                ).length === 0
              ) {
                const newToolCall = {
                  id: toolCalls[0].id,
                  type: toolCalls[0].type,
                  function: {
                    name: toolCalls[0].function?.name,
                    arguments: toolCalls[0].function?.arguments || "",
                  },
                };
                const newLastMessage = {
                  ...lastMessage,
                  tool_calls: [...lastMessageToolCalls, newToolCall],
                };
                return [...messages.slice(0, -1), newLastMessage];
              }
              return messages;
            });
          }
          setCompletionMetrics(null);
          return;
        }
        setCompletionMetrics((metrics) => {
          if (metrics) {
            const now = Date.now();
            return {
              ...metrics,
              firstTokenTime: now,
              latestTokenTime: now,
              nTokens: 1,
            };
          }
          return null;
        });
        for await (const message of responseStream as Stream<ChatCompletionChunk>) {
          setCompletionMetrics((metrics) => {
            if (metrics) {
              const now = Date.now();
              return {
                ...metrics,
                latestTokenTime: now,
                nTokens: metrics.nTokens ? metrics.nTokens + 1 : 1,
              };
            }
            return null;
          });
          const content = message.choices[0].delta.content;
          if (content) {
            setMessages((messages) => {
              const lastMessage = messages[
                messages.length - 1
              ] as ChatCompletionMessage;
              const lastMessageContent = lastMessage.content;
              return [
                ...messages.slice(0, -1),
                {
                  role: "assistant",
                  content: lastMessageContent
                    ? lastMessageContent + content
                    : content,
                },
              ];
            });
          }
          const toolCalls = message.choices[0].delta.tool_calls;
          if (toolCalls) {
            setMessages((messages) => {
              let lastMessage = messages[
                messages.length - 1
              ] as ChatCompletionMessage;
              let lastMessageToolCalls =
                lastMessage.tool_calls === undefined
                  ? []
                  : lastMessage.tool_calls;
              // if tool calls 0 contains an id then add a new tool_call to the end of the tool_calls array
              if (
                toolCalls[0].id !== undefined &&
                lastMessageToolCalls.filter(
                  (toolCall) => toolCall.id === toolCalls[0].id
                ).length === 0
              ) {
                // assert id is defined
                if (toolCalls[0].id === undefined) {
                  throw new Error("toolCalls[0].id is undefined");
                }
                if (toolCalls[0].function?.name === undefined) {
                  throw new Error("toolCalls[0].function.name is undefined");
                }
                if (toolCalls[0].type === undefined) {
                  throw new Error("toolCalls[0].type is undefined");
                }
                const newToolCall = {
                  id: toolCalls[0].id,
                  type: toolCalls[0].type,
                  function: {
                    name: toolCalls[0].function?.name,
                    arguments: toolCalls[0].function?.arguments || "",
                  },
                };
                const newLastMessage = {
                  ...lastMessage,
                  tool_calls: [...lastMessageToolCalls, newToolCall],
                };
                return [...messages.slice(0, -1), newLastMessage];
              } else {
                // else append the .function.arguments to the lastToolCall
                let lastToolCall =
                  lastMessageToolCalls[lastMessageToolCalls.length - 1];
                let lastToolCallFunctionArguments =
                  lastToolCall.function.arguments || "";
                lastToolCallFunctionArguments +=
                  toolCalls[0]?.function?.arguments || "";
                return [
                  ...messages.slice(0, -1),
                  {
                    ...lastMessage,
                    tool_calls: [
                      ...lastMessageToolCalls.slice(0, -1),
                      {
                        ...lastToolCall,
                        function: {
                          ...lastToolCall.function,
                          arguments: lastToolCallFunctionArguments,
                        },
                      },
                    ],
                  },
                ];
              }
            });
          }

          // scroll to bottom
          if (messageContainerRef.current) {
            messagesContainerBottomRef.current?.scrollIntoView({
              behavior: "instant",
            });
          }
        }
        setCompletionMetrics((metrics) => {
          if (metrics) {
            const now = Date.now();
            return {
              ...metrics,
              endTime: now,
            };
          }
          return null;
        });
      })
      .catch((error) => {
        console.error(error);
        setError(error);
      })
      .finally(() => {
        setAbortController(null);
      });
  };
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/open-chat-playground/sw.js")
        .then((registration) =>
          console.log(
            "Service Worker registration successful with scope: ",
            registration.scope
          )
        )
        .catch((err) =>
          console.log("Service Worker registration failed: ", err)
        );
    } else {
      console.log("Service Worker not supported");
    }
  }, []);
  return (
    <div
      className="flex h-dvh flex-col items-center justify-between p-0 sm:p-2 lg:p-4 bg-stone-200 dark:bg-slate-800 relative overflow-hidden text-slate-800 dark:text-slate-200"
      onKeyDown={(e) => {
        // ctr+enter sends message
        if (e.key === "Enter" && e.ctrlKey) {
          sendMessage();
        }
      }}
      autoFocus
      tabIndex={0}
    >
      <div className="p-1 sm:p-4 flex flex-col border rounded-none sm:rounded-lg shadow-lg grow max-w-screen-2xl w-full bg-stone-50 dark:bg-slate-900 overflow-hidden">
        <div className="w-full py-3 pl-3 pr-2 sm:pl-6 sm:pr-3 pb-4 border-b border-slate-200 dark:border-slate-700 sm:border-none flex justify-between items-center sm:items-baseline overflow-hidden">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold">Open Chat Playground</h1>
            <p className="text-slate-500 dark:text-slate-400 hidden sm:block">
              Test out OpenAI <code>/v1/chat/completions</code> compatible web
              servers.
              <br />
              <span className="inline-flex gap-2">
                <a
                  href="https://platform.openai.com/docs/guides/text-generation/chat-completions-api"
                  className="text-emerald-600 hover:underline"
                >
                  Documentation
                </a>
                <a
                  href="https://platform.openai.com/docs/api-reference/chat"
                  className="text-emerald-600 hover:underline"
                >
                  API Reference
                </a>
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            {theme === "dark" ? (
              <button
                onClick={() => setTheme("light")}
                className="focus:outline-none"
                title="Light mode"
              >
                <Sun className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
              </button>
            ) : (
              <button
                onClick={() => setTheme("dark")}
                className="focus:outline-none"
                title="Dark mode"
              >
                <Moon className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
              </button>
            )}
            <CopyButton
              value={() =>
                getCopyUrl({ messages, tools, toolChoice, settings })
              }
            />
            <button
              onClick={() => setSamplingSettingsOpen(!samplingSettingsOpen)}
              className="focus:outline-none block lg:hidden"
              title="Parameters"
            >
              <Settings2 className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
            </button>
            <button
              onClick={() => setToolSettingsOpen(!toolSettingsOpen)}
              className="focus:outline-none block lg:hidden"
              title="Tools"
            >
              <Wrench className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
            </button>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="focus:outline-none"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-400" />
            </button>
          </div>
        </div>
        <div className="flex h-full overflow-hidden">
          <div className="flex flex-col justify-between flex-1 h-full overflow-hidden">
            <div className="flex flex-col items-start gap-2 pb-4 relative overflow-hidden">
              <div
                className="flex flex-col items-start gap-2 pb-4 w-full overflow-y-auto"
                ref={messageContainerRef}
              >
                <ul className="flex flex-col w-full divide-y divide-slate-200 dark:divide-slate-700">
                  {messages.map((message, index) => {
                    return (
                      <li key={index} className="flex-1">
                        <ChatMessage
                          message={message}
                          setMessage={(newMessage: any) => {
                            setMessages((messages) => {
                              const newMessages = [...messages];
                              newMessages[index] = newMessage;
                              return newMessages;
                            });
                          }}
                          deleteMessage={() => {
                            deleteMessage(index);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
                <button
                  ref={messagesContainerBottomRef}
                  onClick={addNewMessage}
                  className="p-1 sm:p-4 px-3 sm:px-6 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 w-full font-bold"
                >
                  <PlusCircle className="w-4 h-4" />
                  Add message
                </button>
              </div>
              <ShowScrollToBottom
                elementRef={messageContainerRef}
                deps={[messages]}
              >
                <div className="bottom-0 left-0 right-0 w-full absolute flex items-center justify-center pb-2">
                  <button
                    className="px-2 py-2 w-auto rounded-full bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-400 font-bold focus:outline-none border border-slate-200 dark:border-slate-700 shadow flex"
                    onClick={() => {
                      messagesContainerBottomRef.current?.scrollIntoView({
                        behavior: "instant",
                      });
                    }}
                  >
                    <ArrowDown />
                  </button>
                </div>
              </ShowScrollToBottom>
            </div>

            {/* section: send button, stop button, tool choice, completion metrics */}
            <div className="px-0 sm:px-4 pt-2 border-t border-slate-200 dark:border-slate-700 sm:border-none flex flex-col-reverse sm:flex-row gap-2">
              {abortController && (
                <button
                  onClick={() => abortController.abort()}
                  className="px-4 py-2 w-full sm:w-auto rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold focus:outline-none"
                >
                  Stop
                </button>
              )}
              {!abortController && (
                <button
                  title="Submit message (CTRL+Enter)"
                  onClick={sendMessage}
                  className="px-4 py-2 w-full sm:w-auto rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white focus:outline-none"
                >
                  Submit
                </button>
              )}
              {tools.length > 0 && (
                <select
                  value={
                    typeof toolChoice === "string"
                      ? toolChoice
                      : `tool:${toolChoice.function.name}`
                  }
                  onChange={(e) => {
                    if (e.target.value.startsWith("tool:")) {
                      setToolChoice({
                        type: "function",
                        function: {
                          name: e.target.value.split(":")[1],
                        },
                      });
                    } else {
                      if (e.target.value === "auto") {
                        setToolChoice("auto");
                      } else {
                        setToolChoice("none");
                      }
                    }
                  }}
                  className="w-auto min-w-[14rem] p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200 dark:border-slate-700 dark:focus:border-slate-700 dark:bg-slate-800"
                >
                  <option value="auto">Auto</option>
                  <option value="none">None</option>
                  {tools.map((tool) => (
                    <option
                      key={tool.function.name}
                      value={`tool:${tool.function.name}`}
                    >
                      Tool: {tool.function.name}
                    </option>
                  ))}
                </select>
              )}
              {completionMetrics && (
                <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-col">
                  {/* time to first token */}
                  {completionMetrics.firstTokenTime &&
                    completionMetrics.startTime && (
                      <div
                        className="flex justify-between gap-2"
                        title={`Time to first token: ${(
                          completionMetrics.firstTokenTime -
                          completionMetrics.startTime
                        ).toFixed(0)}ms`}
                      >
                        <span>TTFT: </span>
                        <span>
                          {(
                            completionMetrics.firstTokenTime -
                            completionMetrics.startTime
                          ).toFixed(0)}
                          ms
                        </span>
                      </div>
                    )}
                  {/* tokens per second */}
                  {completionMetrics.nTokens &&
                    completionMetrics.latestTokenTime &&
                    completionMetrics.firstTokenTime && (
                      <div
                        className="flex justify-between gap-2"
                        title={`Tokens per second: ${(
                          completionMetrics.nTokens /
                          ((completionMetrics.latestTokenTime -
                            completionMetrics.firstTokenTime) /
                            1000)
                        ).toFixed(2)}`}
                      >
                        <span>TPS: </span>
                        <span>
                          {(
                            completionMetrics.nTokens /
                            ((completionMetrics.latestTokenTime -
                              completionMetrics.firstTokenTime) /
                              1000)
                          ).toFixed(2)}
                        </span>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          <div className="hidden lg:flex flex-col max-w-md w-full overflow-hidden">
            <Tab.Group>
              <span className="px-2 flex">
                <Tab.List className="bg-slate-200 dark:bg-slate-800 p-1 rounded-lg font-bold flex w-full">
                  <Tab
                    className={({ selected }) =>
                      "flex-1 focus:outline-none py-1 px-4 " +
                      (selected
                        ? "bg-white dark:bg-slate-900 rounded-lg shadow text-slate-800 dark:text-slate-200"
                        : "bg-transparent text-slate-500 dark:text-slate-400")
                    }
                  >
                    Parameters
                  </Tab>
                  <Tab
                    className={({ selected }) =>
                      "flex-1 focus:outline-none py-1 px-4 " +
                      (selected
                        ? "bg-white dark:bg-slate-900 rounded-lg shadow text-slate-800 dark:text-slate-200"
                        : "bg-transparent text-slate-500 dark:text-slate-400")
                    }
                  >
                    Tools
                  </Tab>
                </Tab.List>
              </span>
              <Tab.Panels className="h-full overflow-hidden">
                <Tab.Panel className="h-full">
                  <SamplingSettings
                    settings={settings}
                    setSettings={setSettings}
                  />
                </Tab.Panel>
                <Tab.Panel className="h-full">
                  <ToolSettings
                    tools={tools}
                    setTools={setTools}
                    toolChoice={toolChoice}
                    setToolChoice={setToolChoice}
                  />
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>
          </div>
        </div>
      </div>
      {settingsOpen && (
        <SettingsDialog
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
        />
      )}
      {samplingSettingsOpen && (
        <SamplingSettingsDialog
          settingsOpen={samplingSettingsOpen}
          setSettingsOpen={setSamplingSettingsOpen}
          settings={settings}
          setSettings={setSettings}
        />
      )}
      {toolSettingsOpen && (
        <ToolSettingsDialog
          tools={tools}
          setTools={setTools}
          toolChoice={toolChoice}
          setToolChoice={setToolChoice}
          settingsOpen={toolSettingsOpen}
          setSettingsOpen={setToolSettingsOpen}
        />
      )}
      {error && <ErrorToast error={error} dismiss={() => setError(null)} />}
    </div>
  );
}
