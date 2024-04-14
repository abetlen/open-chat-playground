"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
} from "lucide-react";

import { Dialog } from "@headlessui/react";

import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight as light } from "react-syntax-highlighter/dist/esm/styles/prism";
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
} from "openai/resources/chat/index";

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
      stream: true,
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

const reactMarkdownComponents = {
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
    return <ul className="list-disc pl-8">{children}</ul>;
  },
  ol: (props: any) => {
    const { children, ...rest } = props;
    return <ol className="list-decimal pl-8">{children}</ol>;
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
              style={light}
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
};

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

const useLocalStorageBoolean = (key: string, initialValue: boolean) => {
  return useLocalStorage({
    key,
    initialValue,
    serialize: (value) => value.toString(),
    deserialize: (value) => value === "true",
  });
};

const useLocalStorageString = (key: string, initialValue: string) => {
  return useLocalStorage({
    key,
    initialValue,
    serialize: (value) => value,
    deserialize: (value) => value,
  });
};

const useLocalStorageNumber = (key: string, initialValue: number) => {
  return useLocalStorage({
    key,
    initialValue,
    serialize: (value) => value.toString(),
    deserialize: (value) => parseFloat(value),
  });
};

const ResizeableTextarea = (props: any) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (textAreaRef.current && props.autoFocus) {
      textAreaRef.current.focus();
      textAreaRef.current.setSelectionRange(
        textAreaRef.current.value.length,
        textAreaRef.current.value.length
      );
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
}: {
  role: ChatCompletionRole;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  return (
    <>
      {editing ? (
        <ResizeableTextarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
          }}
          placeholder={`Enter a ${role} message here.`}
          className="disabled:hidden block w-full text-left p-1 px-2 sm:p-2 whitespace-pre-wrap focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 border-none outline-none focus:border-none rounded-lg resize-none group-hover:bg-white focus:bg-white bg-transparent"
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
          className="text-left p-1 px-2 sm:p-2 group-hover:bg-white rounded-lg cursor-text w-full"
        >
          {value ? (
            <Markdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={reactMarkdownComponents}
              className="whitespace-pre-wrap break-all"
            >
              {value}
            </Markdown>
          ) : (
            <div className="text-slate-400">
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
            className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter image URL or paste image here."
          />
          {/* file input */}
          <label className="p-2 cursor-pointer">
            <Paperclip className="w-5 h-5 text-slate-600 hover:text-slate-800" />
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
              className="p-2"
            >
              <Check className="w-5 h-5" />
            </button>
          )}
          {/* delete button */}
          <button
            onClick={() => {
              deleteImage();
            }}
            className="p-2"
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
  editing,
  setEditing,
}: {
  message: ChatCompletionMessageParam;
  setMessage: (message: ChatCompletionMessageParam) => void;
  deleteMessage: () => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rootRef}
      className="flex flex-col sm:flex-row w-full gap-1 sm:gap-2 group hover:bg-slate-200 p-1 py-2 sm:p-4 rounded-lg items-baseline grow flex-1"
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
          className="uppercase font-bold text-left group-hover:bg-slate-300 p-1 px-2 sm:p-2 rounded-lg text-sm"
        >
          {message.role}
        </button>
        <button
          onClick={deleteMessage}
          className="block sm:hidden"
          title="Delete message"
        >
          <MinusCircle className="w-5 h-5 text-slate-400" />
        </button>
      </div>
      <span className="flex-1 w-full sm:w-auto h-full flex flex-col min-h-fit items-start">
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
                    className="flex flex-col ring ring-slate-200 rounded-lg group-hover:ring-slate-300 bg-white focus-within:ring-emerald-600 focus-within:ring-1"
                  >
                    <div className="flex justify-between gap-2 bg-gray-200">
                      <input
                        type="text"
                        placeholder="Enter selected tool name here."
                        className="pl-3 p-1 bg-transparent border-none focus:border-none focus:ring-0 flex-1"
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
                        <X className="w-5 h-5 text-slate-400 sm:text-slate-400 hover:text-slate-600 group-hover:text-slate-600" />
                      </button>
                    </div>
                    <CodeMirror
                      basicSetup={{
                        lineNumbers: false,
                        foldGutter: false,
                        highlightActiveLine: false,
                        highlightSelectionMatches: false,
                      }}
                      className="rounded-lg p-1 py-2 bg-white border border-transparent bg-transparent text-base"
                      extensions={[json()]}
                      placeholder="Enter selected tool call arguments here."
                      value={toolCall.function.arguments}
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
                  className="p-2 rounded-lg hover:bg-slate-300 flex items-center justify-center font-bold text-slate-400 sm:text-transparent group-hover:text-slate-800"
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
                className="p-2 rounded-lg hover:bg-slate-300 flex items-center justify-center font-bold text-slate-400 sm:text-transparent group-hover:text-slate-800"
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
              {/* <button
                title="Add text content"
                className="p-2 rounded-lg hover:bg-slate-300 flex items-center justify-center font-bold text-slate-400 sm:text-transparent group-hover:text-slate-800"
                onClick={() => {
                  const newMessage = {
                    ...message,
                    content: Array.isArray(message.content)
                      ? message.content.concat([{ type: "text", text: "" }])
                      : [
                          { type: "text", text: message.content },
                          { type: "text", text: "" },
                        ],
                  };
                  setMessage(newMessage as ChatCompletionMessageParam);
                }}
              >
                <Type className="w-5 h-5" />
              </button> */}
              {(typeof message.content === "string" ||
                !message.content.find((c) => c.type === "image_url")) && (
                <button
                  title="Add image content"
                  className="p-2 rounded-lg hover:bg-slate-300 flex items-center justify-center font-bold text-slate-400 sm:text-transparent group-hover:text-slate-800"
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
        <MinusCircle className="w-4 h-4 text-transparent group-hover:text-slate-600" />
      </button>
    </div>
  );
};

const CopyButton = ({ value }: { value: string }) => {
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
        await copyToClipboard(value);
      }}
      title="Copy to clipboard"
    >
      {copied ? (
        <ClipboardCheck className="w-5 h-5" />
      ) : (
        <Clipboard className="w-5 h-5 text-slate-500 hover:text-slate-800" />
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

  const saveSettingsButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      className="relative z-50"
      initialFocus={saveSettingsButtonRef}
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg p-4 border max-w-none sm:max-w-xl w-full gap-2 bg-white max-h-full flex flex-col">
          <div>
            <div className="w-full flex justify-between">
              <Dialog.Title className="font-bold text-lg">
                Settings
              </Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500">
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
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Enter the base URL for the OpenAI API"
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
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
            ref={saveSettingsButtonRef}
          >
            Save
          </button>
        </Dialog.Panel>
      </div>
    </Dialog>
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
  const [seed, setSeed] = useState(settings.seed);
  const [temperature, setTemperature] = useState(settings.temperature);
  const [maxTokens, setMaxTokens] = useState(settings.maxTokens);
  const [topP, setTopP] = useState(settings.topP);
  const [presencePenalty, setPresencePenalty] = useState(
    settings.presencePenalty
  );
  const [frequencyPenalty, setFrequencyPenalty] = useState(
    settings.frequencyPenalty
  );
  const [jsonMode, setJsonMode] = useState(settings.jsonMode);
  const [stopSequence, setStopSequence] = useState<string>("");
  const [stop, setStop] = useState<string[]>(settings.stop);

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
    };
    setSettings(newSettings);
  };

  return (
    <Dialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      className="relative z-50"
      initialFocus={saveSettingsButtonRef}
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg border max-w-none sm:max-w-xl w-full bg-white p-4 gap-2 flex flex-col max-h-dvh">
          <div>
            <div className="flex justify-between">
              <Dialog.Title className="font-bold text-lg">
                Request Parameters
              </Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500">
              Configure parameters for chat completion requests.
            </Dialog.Description>
          </div>
          <div className="flex flex-col gap-4 py-4 overflow-y-auto px-2 -mx-2">
            {/* model */}
            <div className="w-ful">
              <label
                htmlFor="model"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Model
              </label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                type="text"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Model name"
              />
            </div>
            {/* seed */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="seed"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Seed
              </label>
              <input
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Seed value. Enter -1 for random."
              />
            </div>
            {/* temperature */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="temperature"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Temperature
              </label>
              <input
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Sampling temperature. Enter 0 for deterministic decoding."
              />
            </div>
            {/* Top P */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="top-p"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Top P
              </label>
              <input
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Enter the top p for the OpenAI API"
              />
            </div>
            {/* Frequency Penalty */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="frequency-penalty"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Frequency Penalty
              </label>
              <input
                value={frequencyPenalty}
                onChange={(e) =>
                  setFrequencyPenalty(parseFloat(e.target.value))
                }
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Enter the frequency penalty for the OpenAI API"
              />
            </div>
            {/* Presence Penalty */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="presence-penalty"
                className="text-slate-800 dark:text-slate-4000 text-sm font-bold"
              >
                Presence Penalty
              </label>
              <input
                value={presencePenalty}
                onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Enter the presence penalty for the OpenAI API"
              />
            </div>
            {/* max tokens */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="max-tokens"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Max Tokens
              </label>
              <input
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Maximum number of tokens to generate. Enter -1 for no limit."
              />
            </div>
            {/* stop */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="stop"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Stop Sequences
              </label>
              <div className="flex">
                <form
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
                    className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                    placeholder="Stop sequence used to stop generation."
                  />
                  <button
                    type="submit"
                    disabled={stopSequence === ""}
                    className="p-1 sm:p-2 focus:outline-none focus:ring-none rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 disabled:bg-slate-100"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
              <div className="flex flex-wrap gap-1">
                {stop.map((stopSequence, index) => (
                  <div
                    key={index}
                    className="text-slate-800 bg-slate-200 rounded-lg text-sm"
                  >
                    <button
                      onClick={() => {
                        if (stop) {
                          setStop(stop.filter((_, i) => i !== index));
                        }
                      }}
                      className="p-1 sm:p-2 focus:ring-none rounded-lg border border-none focus:border-none flex items-center gap-1 hover:text-slate-900"
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
                htmlFor="json-mode"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                JSON Mode
              </label>
              <div className="flex items-center gap-2">
                <input
                  checked={jsonMode}
                  onChange={(e) => setJsonMode(e.target.checked)}
                  type="checkbox"
                  className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded-lg border border-slate-200"
                  placeholder="Enter the model for the OpenAI API"
                  id="json-mode"
                />
                <label htmlFor="json-mode" className="text-sm">
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
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-start sm:items-center justify-center p-0 sm:p-4 max-h-dvh">
        <Dialog.Panel className="shadow-xl rounded-b-lg sm:rounded-lg border max-w-none sm:max-w-xl w-full bg-white p-4 gap-2 flex flex-col max-h-dvh">
          <div>
            <div className="flex justify-between">
              <Dialog.Title className="font-bold text-lg">Tools</Dialog.Title>
              <button
                className="focus:outline-none text-slate-600 hover:text-slate-800"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="w-5 h-5 text-slate-500 hover:text-slate-800" />
              </button>
            </div>
            <Dialog.Description className="text-slate-500">
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
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                    className="focus-within:ring-emerald-600 focus-within:ring-1 sm:focus-within:ring-2 ring-slate-400 rounded-lg ring-1"
                  >
                    <div className="flex flex-col relative">
                      <div className="flex flex-col bg-slate-200 p-2">
                        <div className="flex justify-between">
                          <input
                            className="border-none focus:ring-0 focus:border-none bg-transparent font-bold p-0"
                            value={tool.name}
                            onChange={(e) => {
                              setCurrentTools(
                                currentTools.map((t, index) =>
                                  index === index
                                    ? {
                                        ...t,
                                        name: e.target.value,
                                      }
                                    : t
                                )
                              );
                            }}
                            placeholder="Enter tool name here."
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
                              currentTools.map((t, index) =>
                                index === index
                                  ? {
                                      ...t,
                                      description: e.target.value,
                                    }
                                  : t
                              )
                            );
                          }}
                          placeholder="Enter tool description here."
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
                            className="rounded-lg p-0 bg-white text-base"
                            extensions={[json()]}
                            value={tool.parameters}
                            placeholder="Enter OpenAPI Spec JSON here."
                            onChange={(value) => {
                              setCurrentTools(
                                currentTools.map((t, index) =>
                                  index === index
                                    ? { ...t, parameters: value }
                                    : t
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
                      parameters: "",
                    },
                  ])
                }
                className="px-2 py-1 sm:py-4 rounded-lg hover:bg-slate-200 flex items-center gap-2 w-full font-bold"
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

export default function Home() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [tools, setTools] = useState<ChatCompletionTool[]>(INITIAL_TOOLS);
  const [toolChoice, setToolChoice] =
    useState<ChatCompletionToolChoiceOption>(INITIAL_TOOL_CHOICE);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [samplingSettingsOpen, setSamplingSettingsOpen] = useState(false);
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [completionMetrics, setCompletionMetrics] = useState<{
    startTime: number;
    endTime: number | null;
    firstTokenTime: number | null;
    latestTokenTime: number | null;
    nTokens: number | null;
  } | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const messagesContainerBottomRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const checkScroll = () => {
      if (!messageContainerRef.current) {
        return;
      }
      const distanceToBottom =
        messageContainerRef.current.scrollHeight -
        messageContainerRef.current.scrollTop -
        messageContainerRef.current.clientHeight;
      const isAtBottom = distanceToBottom <= 1;
      const hasScrollBar =
        messageContainerRef.current.scrollHeight >
        messageContainerRef.current.clientHeight;
      // show scroll button
      setShowScrollButton(hasScrollBar && !isAtBottom);
    };
    checkScroll();
    const messageContainer = messageContainerRef.current;
    if (!messageContainer) {
      return;
    }
    // scroll events
    messageContainer.addEventListener("scroll", () => {
      checkScroll();
    });
    // resize events
    window.addEventListener("resize", checkScroll);
    return () => {
      messageContainer.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [messages]);
  const deleteMessage = (index: number) => {
    const newMessages = [...messages];
    newMessages.splice(index, 1);
    setMessages(newMessages);
  };
  const addNewMessage = () => {
    setMessages((messages) => {
      const newMessages = [...messages];
      newMessages.push({ role: "user", content: "" });
      setEditIndex(newMessages.length - 1);
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
        for await (const message of responseStream) {
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
      })
      .finally(() => {
        setAbortController(null);
      });
  };
  return (
    <div
      className="flex h-dvh flex-col items-center justify-between p-0 sm:p-2 lg:p-24 bg-stone-200 dark:bg-slate-800 relative"
      onKeyDown={(e) => {
        // ctr+enter sends message
        if (e.key === "Enter" && e.ctrlKey) {
          sendMessage();
          setEditIndex(null);
        }
      }}
      autoFocus
      tabIndex={0}
    >
      <div className="p-1 sm:p-4 flex flex-col border rounded-none sm:rounded-lg shadow-lg grow max-w-7xl w-full bg-stone-50 dark:bg-slate-9000">
        <div className="w-full py-3 pl-3 pr-2 sm:pl-6 sm:pr-3 pb-4 border-b border-slate-200 sm:border-none flex justify-between items-center sm:items-baseline">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold">Chat Playground</h1>
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
            <CopyButton value={JSON.stringify(messages, null, 2)} />
            <button
              onClick={() => setToolSettingsOpen(!toolSettingsOpen)}
              className="focus:outline-none"
              title="Tools"
            >
              <Wrench className="w-5 h-5 text-slate-500 hover:text-slate-800" />
            </button>
            <button
              onClick={() => setSamplingSettingsOpen(!samplingSettingsOpen)}
              className="focus:outline-none"
              title="Request Parameters"
            >
              <Settings2 className="w-5 h-5 text-slate-500 hover:text-slate-800" />
            </button>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="focus:outline-none"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-slate-500 hover:text-slate-800" />
            </button>
          </div>
        </div>
        <div className="w-full h-full flex flex-col items-start gap-2 pb-4 overflow-y-auto relative">
          <div
            className="w-full h-full flex flex-col items-start gap-2 pb-4 overflow-y-auto"
            ref={messageContainerRef}
          >
            <ul className="flex flex-col w-full divide-y divide-slate-200">
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
                      editing={editIndex === index}
                      setEditing={(editing: boolean) => {
                        setEditIndex(editing ? index : null);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
            <button
              ref={messagesContainerBottomRef}
              onClick={addNewMessage}
              className="p-1 sm:p-4 px-3 sm:px-6 rounded-lg hover:bg-slate-200 flex items-center gap-2 w-full font-bold"
            >
              <PlusCircle className="w-4 h-4" />
              Add message
            </button>
          </div>
          {showScrollButton && (
            <div className="bottom-0 left-0 right-0 w-full absolute flex items-center justify-center pb-2">
              <button
                className="px-2 py-2 w-auto rounded-full bg-white hover:bg-slate-100 text-slate-800 font-bold focus:outline-none border border-slate-200 shadow flex"
                onClick={() => {
                  messagesContainerBottomRef.current?.scrollIntoView({
                    behavior: "instant",
                  });
                }}
              >
                <ArrowDown />
              </button>
            </div>
          )}
        </div>
        {/* section: send button, stop button, tool choice, completion metrics */}
        <div className="w-full px-0 sm:px-4 pt-2 border-t border-slate-200 sm:border-none flex flex-col-reverse sm:flex-row gap-2">
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
              className="min-w-[10rem] p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
    </div>
  );
}
