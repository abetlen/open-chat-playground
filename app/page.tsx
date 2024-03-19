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
  Hammer,
  Plus,
} from "lucide-react";

import { Dialog } from "@headlessui/react";

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

import OpenAI from "openai";

const createChatCompletion = (
  messages: any,
  { signal }: { signal: AbortSignal }
) => {
  const baseURL = localStorage.getItem("baseURL");
  const apiKey = localStorage.getItem("apiKey") || "";
  const model = localStorage.getItem("model");
  const seed = localStorage.getItem("seed");
  const temperature = localStorage.getItem("temperature");
  const maxTokens = localStorage.getItem("maxTokens");
  const frequencyPenalty = localStorage.getItem("frequencyPenalty");
  const presencePenalty = localStorage.getItem("presencePenalty");
  const stop = localStorage.getItem("stop");
  const jsonMode = localStorage.getItem("jsonMode") === "true";
  const openai = new OpenAI({
    baseURL: baseURL === "" ? undefined : baseURL,
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  return openai.chat.completions.create(
    {
      messages: messages,
      model: model !== null ? model : "",
      seed: seed !== null ? parseInt(seed) : undefined,
      temperature: temperature !== null ? parseFloat(temperature) : undefined,
      max_tokens:
        maxTokens !== null
          ? parseInt(maxTokens) < 0
            ? undefined
            : parseInt(maxTokens)
          : undefined,
      stop: stop !== null ? JSON.parse(stop) : undefined,
      frequency_penalty:
        frequencyPenalty !== null ? parseFloat(frequencyPenalty) : undefined,
      presence_penalty:
        presencePenalty !== null ? parseFloat(presencePenalty) : undefined,
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
              {...rest}
              PreTag="div"
              language={match[1]}
              style={light}
              wrapLongLines={true}
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

const INITIAL_MESSAGES = [
  { role: "system", content: "You are a helpful assistant" },
  { role: "user", content: "What is the capital of France?" },
  { role: "assistant", content: "Paris is the capital of France." },
];

const ROLES = ["system", "user", "assistant"];

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

const ChatMessage = ({
  message,
  setMessage,
  deleteMessage,
  editing,
  setEditing,
}: {
  message: any;
  setMessage: any;
  deleteMessage: () => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
}) => {
  const cycleMessageRole = () => {
    const newMessage = { ...message };
    newMessage.role =
      ROLES[(ROLES.indexOf(newMessage.role) + 1) % ROLES.length];
    setMessage(newMessage);
  };
  const addImage = () => {
    const newMessage = { ...message };
    if (typeof newMessage.content === "string") {
      newMessage.content = [
        {
          type: "text",
          content: newMessage.content,
        },
      ];
    }
    newMessage.content.push({
      type: "image_url",
      image_url: { url: "https://via.placeholder.com/150" },
    });
    setMessage(newMessage);
  };
  return (
    <div className="flex flex-col sm:flex-row w-full gap-1 sm:gap-2 group hover:bg-slate-200 p-1 py-2 sm:p-4 rounded-lg items-baseline grow flex-1">
      <div className="min-w-28 flex justify-between w-full sm:w-auto pr-1">
        <button
          onClick={cycleMessageRole}
          className="uppercase font-bold text-left group-hover:bg-slate-300 p-1 px-2 sm:p-2 rounded-lg text-sm"
        >
          {message.role}
        </button>
        <button onClick={deleteMessage} className="block sm:hidden">
          <MinusCircle className="w-5 h-5 text-slate-400" />
        </button>
      </div>
      <span className="flex-1 h-full w-full flex flex-col min-h-fit grow items-start">
        <button
          data-editing={editing}
          onClick={() => setEditing(true)}
          className="block data-[editing=true]:hidden flex-1 h-full w-full text-left p-1 px-2 sm:p-2 whitespace-pre-wrap select-text"
        >
          {message.content.length > 0 && (
            <>
              <Markdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={reactMarkdownComponents}
              >
                {message.content}
              </Markdown>
            </>
          )}
          {message.content.length === 0 && (
            <>
              <span className="text-slate-600">
                Enter a {message.role} message here.
              </span>
            </>
          )}
        </button>
        <ResizeableTextarea
          autoFocus={editing}
          disabled={!editing}
          value={message.content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newMessage = { ...message, content: e.target.value };
            setMessage(newMessage);
          }}
          placeholder={`Enter a ${message.role} message here.`}
          className="disabled:hidden block w-full text-left p-1 px-2 sm:p-2 whitespace-pre-wrap focus:ring-emerald-600 focus:ring-1 sm:focus:ring-2 ring ring-slate-400 focus:border-none rounded-lg resize-none overflow-hidden"
          onBlur={() => {
            if (editing) {
              setEditing(false);
            }
          }}
        />
      </span>
      <button onClick={deleteMessage} className="hidden sm:block">
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
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
  settingsOpen,
  setSettingsOpen,
}: {
  settingsOpen: boolean;
  setSettingsOpen: (settingsOpen: boolean) => void;
}) => {
  const model = useLocalStorageString("model", "gpt-3.5-turbo");
  const seed = useLocalStorageNumber("seed", -1);
  const temperature = useLocalStorageNumber("temperature", 0.5);
  const maxTokens = useLocalStorageNumber("maxTokens", -1);
  const topP = useLocalStorageNumber("topP", 1);
  const presencePenalty = useLocalStorageNumber("presencePenalty", 0);
  const frequencyPenalty = useLocalStorageNumber("frequencyPenalty", 0);
  const jsonMode = useLocalStorageBoolean("jsonMode", false);
  const [stopSequence, setStopSequence] = useState<string>("");
  const stop = useLocalStorage<string[] | null>({
    key: "stop",
    initialValue: null,
    serialize: (value) => JSON.stringify(value),
    deserialize: (value) => JSON.parse(value),
  });

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
                value={model.value}
                onChange={(e) => model.setValue(e.target.value)}
                type="text"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                value={seed.value}
                onChange={(e) => seed.setValue(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                value={temperature.value}
                onChange={(e) =>
                  temperature.setValue(parseFloat(e.target.value))
                }
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-2000"
                placeholder="Sampling temperature. Enter 0 for deterministic decoding."
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
                value={maxTokens.value}
                onChange={(e) => maxTokens.setValue(parseInt(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                    if (stop.value && stop.value.includes(stopSequence)) {
                      return;
                    }
                    stop.setValue([...(stop.value || []), stopSequence]);
                    setStopSequence("");
                  }}
                  className="flex w-full gap-2"
                >
                  <input
                    value={stopSequence}
                    onChange={(e) => setStopSequence(e.target.value)}
                    type="text"
                    className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                {stop.value &&
                  stop.value.map((stopSequence, index) => (
                    <div
                      key={index}
                      className="text-slate-800 bg-slate-200 rounded text-sm"
                    >
                      <button
                        onClick={() => {
                          if (stop.value) {
                            stop.setValue(
                              stop.value.filter((_, i) => i !== index)
                            );
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
            {/* Top P */}
            <div className="w-full flex flex-col gap-2">
              <label
                htmlFor="top-p"
                className="text-slate-800 dark:text-slate-400 text-sm font-bold"
              >
                Top P
              </label>
              <input
                value={topP.value}
                onChange={(e) => topP.setValue(parseFloat(e.target.value))}
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                value={frequencyPenalty.value}
                onChange={(e) =>
                  frequencyPenalty.setValue(parseFloat(e.target.value))
                }
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
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
                value={presencePenalty.value}
                onChange={(e) =>
                  presencePenalty.setValue(parseFloat(e.target.value))
                }
                type="number"
                className="w-full p-1 sm:p-2 focus:ring-emerald-600 focus:ring-2 rounded-lg border border-slate-200 focus:border-slate-200"
                placeholder="Enter the presence penalty for the OpenAI API"
              />
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
                  checked={jsonMode.value}
                  onChange={(e) => jsonMode.setValue(e.target.checked)}
                  type="checkbox"
                  className="p-1 sm:p-2 focus:ring-emerald-600 text-emerald-600 rounded border border-slate-200"
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
                model.save();
                seed.save();
                temperature.save();
                maxTokens.save();
                topP.save();
                presencePenalty.save();
                frequencyPenalty.save();
                jsonMode.save();
                stop.save();
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

export default function Home() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [samplingSettingsOpen, setSamplingSettingsOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
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
    setMessages((messages) => [
      ...messages,
      { role: "assistant", content: "" },
    ]);
    const abortController = new AbortController();
    setAbortController(abortController);
    const signal = abortController.signal;
    createChatCompletion(messages, { signal })
      .then(async (responseStream) => {
        for await (const message of responseStream) {
          if (!message.choices[0].delta.content) {
            continue;
          }
          setMessages((messages) => {
            const lastMessageContent = messages[messages.length - 1].content;
            const delta = message.choices[0].delta.content;
            return [
              ...messages.slice(0, -1),
              { role: "assistant", content: lastMessageContent + delta },
            ];
          });
        }
      })
      .finally(() => {
        setAbortController(null);
      });
  };
  return (
    <main
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
      <div className="p-1 sm:p-4 flex flex-col border rounded-none sm:rounded-lg overflow-hidden shadow-lg grow max-w-7xl w-full bg-stone-50 dark:bg-slate-900">
        <div className="w-full py-3 pl-3 pr-2 sm:pl-6 sm:pr-3 pb-4 border-b border-slate-200 sm:border-none flex justify-between items-center sm:items-baseline">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold">Chat Playground</h1>
            <p className="text-slate-500 dark:text-slate-400 hidden sm:block">
              Test out <code>/v1/chat/completions</code> OpenAI compatible web
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
          />
        )}
        <div className="w-full h-full flex flex-col items-start gap-2 overflow-y-auto pb-4">
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
            onClick={addNewMessage}
            className="p-1 sm:p-4 px-3 sm:px-6 rounded-lg hover:bg-slate-200 flex items-center gap-2 w-full font-bold"
          >
            <PlusCircle className="w-4 h-4" />
            Add message
          </button>
        </div>
        <div className="w-full px-0 sm:px-4 pt-2 border-t border-slate-200 sm:border-none">
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
        </div>
      </div>
    </main>
  );
}
