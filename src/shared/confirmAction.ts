// Native dialog supplies focus trapping, Escape and a modal backdrop without blocking JS.
export function confirmAction(
  message: string,
  title = "Antes de continuar",
  accept = "Continuar",
): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "confirmation-dialog";
    const heading = document.createElement("h2");
    heading.id = `confirmation-${crypto.randomUUID()}`;
    heading.textContent = title;
    dialog.setAttribute("aria-labelledby", heading.id);
    const text = document.createElement("p");
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "confirmation-actions";
    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.textContent = "Cancelar";
    const confirm = document.createElement("button");
    confirm.className = "primary";
    confirm.textContent = accept;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      previous?.focus();
      resolve(value);
    };
    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    dialog.onclose = () => finish(false);
    actions.append(cancel, confirm);
    dialog.append(heading, text, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
