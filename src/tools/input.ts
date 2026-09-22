export function isEditableTarget(target: EventTarget | null): boolean {
    if (!target || typeof target !== 'object') return false;

    const element = target as HTMLElement;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable === true;
}
