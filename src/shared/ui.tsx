import { knowledgeState, labels } from "./utils";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
export function Icon({
  name = "grid",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    mic: (
      <>
        <rect x="9" y="2" width="6" height="13" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </>
    ),
    upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
    monitor: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    share: (
      <>
        <path d="M8 10V4h12v12h-6M4 14v6h6M4 20l10-10m-6 0h6v6" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m7 4 13 8-13 8Z" />,
    stop: <rect x="5" y="5" width="14" height="14" rx="2" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
    video: (
      <>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="m16 10 6-4v12l-6-4" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    record: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    book: (
      <path d="M12 5v16M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" />
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    logout: <path d="M10 4H4v16h6M9 12h12m-5-5 5 5-5 5" />,
    spark: (
      <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    message: <path d="M4 5h16v10H8l-4 4Z" />,
    shield: (
      <path d="M12 3 5 6v5c0 5 3 8 7 9 4-1 7-4 7-9V6Z" />
    ),
    chart: (
      <>
        <path d="M4 20V10" />
        <path d="M11 20V4" />
        <path d="M18 20v-7" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {labels[status] || status}
    </span>
  );
}
export function KnowledgeChip({
  origin,
  validation,
}: {
  origin: string;
  validation: string;
}) {
  const state = knowledgeState(origin, validation);
  return <span className={`knowledge-chip ${state.key}`}>{state.label}</span>;
}

/* Reparto de un conjunto de pasos por estado, como una sola barra. */
export function StateBar({
  steps,
}: {
  steps: { origin: string; validation_status: string }[];
}) {
  if (!steps.length) return null;
  const count = (key: string) =>
    steps.filter((s) => knowledgeState(s.origin, s.validation_status).key === key)
      .length;
  const parts = [
    { key: "validado", label: "Validado", n: count("validado") },
    { key: "inferido", label: "Inferido", n: count("inferido") },
    { key: "observado", label: "Observado", n: count("observado") },
  ].filter((p) => p.n > 0);
  return (
    <div className="state-summary">
      <div className="state-bar">
        {parts.map((p) => (
          <i
            key={p.key}
            className={p.key}
            style={{ width: `${(p.n / steps.length) * 100}%` }}
          />
        ))}
      </div>
      <div className="state-legend">
        {parts.map((p) => (
          <span key={p.key}>
            <i className={`state-dot ${p.key}`} />
            {p.label} {p.n}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Empty({
  title,
  children,
  icon = "book",
}: {
  title: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : null;
}
export function Modal({
  title,
  eyebrow,
  className,
  children,
  close,
}: {
  title: string;
  eyebrow?: string;
  className?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="Cerrar">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}

export type SelectOption = { value: string; label: string };
/*
  Un select propio: el navegador no deja estilizar la lista abierta de un
  <select> nativo, y esa lista termina con la tipografía y el azul por
  defecto del sistema operativo, fuera de la identidad del producto.
*/
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  name,
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  function openMenu() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  }
  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") trigger.current?.focus();
    }
  }
  return (
    <div className={`select-field ${className || ""}`} ref={wrapper}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        ref={trigger}
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected?.label ?? ""}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <ul
          id={listId}
          className="select-listbox"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          ref={(node) => node?.focus()}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={index === active ? "active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={() => commit(index)}
            >
              {option.value === value && <Icon name="check" size={13} />}
              <span>{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
