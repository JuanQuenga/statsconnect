export async function shareContent(data: { title: string; text: string; url: string }): Promise<"shared" | "copied"> {
  if (navigator.share) {
    await navigator.share(data);
    return "shared";
  }
  await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
  return "copied";
}

export function downloadText(filename: string, contents: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
