"use client";

import { useEffect, useRef, useState } from "react";

import {
  MinusCircle,
  PlusCircle,
  Settings,
  Clipboard,
  ClipboardCheck,
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
  const openai = new OpenAI({
    baseURL: baseURL === "" ? undefined : baseURL,
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  return openai.chat.completions.create(
    {
      messages: messages,
      model: "gpt-3.5-turbo",
      stream: true,
    },
    {
      signal,
    }
  );
};

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
          className="disabled:hidden block w-full text-left p-1 px-2 sm:p-2 whitespace-pre-wrap focus:outline-emerald-600 focus:outline-1 sm:focus:outline-2 outline outline-1 outline-slate-400 rounded-lg resize-none overflow-hidden"
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
    >
      {copied ? (
        <ClipboardCheck className="w-5 h-5" />
      ) : (
        <Clipboard className="w-5 h-5 text-slate-500 hover:text-slate-800" />
      )}
    </button>
  );
};

export default function Home() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [baseURL, setBaseURL] = useState<string>("");
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
  useEffect(() => {
    if (settingsOpen) {
      setApiKey(localStorage.getItem("apiKey") || "");
      setBaseURL(localStorage.getItem("baseURL") || "");
    }
  }, [settingsOpen]);
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
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="focus:outline-none"
            >
              <Settings className="w-5 h-5 text-slate-500 hover:text-slate-800" />
            </button>
          </div>
        </div>
        <Dialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          className="relative z-50"
          initialFocus={saveSettingsButtonRef}
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
            <Dialog.Panel className="shadow-xl rounded-lg p-4 border max-w-xl w-full gap-4 bg-white">
              <Dialog.Title className="font-bold text-lg">
                Settings
              </Dialog.Title>
              <Dialog.Description className="text-slate-500">
                Configure settings for the chat playground.
              </Dialog.Description>

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
                    value={baseURL}
                    onChange={(e) => setBaseURL(e.target.value)}
                    type="url"
                    className="w-full p-1 sm:p-2 focus:outline-emerald-600 rounded-lg border border-slate-200"
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
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                    className="w-full p-1 sm:p-2 focus:outline-emerald-600 rounded-lg border border-slate-200"
                    placeholder="Enter the API key for the OpenAI API"
                  />
                </div>
              </div>
              <button
                className="p-2 px-4 w-full sm:w-auto rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 focus:outline-none"
                onClick={() => {
                  setSettingsOpen(false);
                  localStorage.setItem("apiKey", apiKey || "");
                  localStorage.setItem("baseURL", baseURL || "");
                }}
                ref={saveSettingsButtonRef}
              >
                Save
              </button>
            </Dialog.Panel>
          </div>
        </Dialog>
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
