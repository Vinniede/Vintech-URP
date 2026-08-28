import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "confirm";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`urp-button urp-button-${variant} ${className}`.trim()}
      {...props}
    />
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`urp-input ${className}`.trim()} {...props} />;
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`urp-select ${className}`.trim()} {...props} />;
}

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`urp-card ${className}`.trim()}>{children}</section>
  );
}

export function Alert({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`urp-alert ${className}`.trim()} role="status">
      {children}
    </div>
  );
}

export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <span className={`urp-badge ${className}`.trim()}>{children}</span>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="urp-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="urp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Table({
  children,
  className = "",
  ...props
}: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="urp-table-wrap">
      <table className={`urp-table ${className}`.trim()} {...props}>
        {children}
      </table>
    </div>
  );
}

export function NumericCell({
  children,
  header = false,
}: {
  children: ReactNode;
  header?: boolean;
}) {
  const Tag = header ? "th" : "td";
  return <Tag className="urp-table-numeric">{children}</Tag>;
}

export function StatusPulse({
  online,
  label,
}: {
  online: boolean;
  label?: string;
}) {
  return (
    <span
      className={`urp-status-pulse ${online ? "urp-status-pulse-online" : ""}`}
      role="status"
    >
      <span className="urp-status-pulse-dot" aria-hidden="true" />
      {label ?? (online ? "Online" : "Offline")}
    </span>
  );
}
