import { ApiError } from "../../shared/api";
export async function snapshot(stream: MediaStream): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    if (!video.videoWidth || !video.videoHeight)
      throw new ApiError(0, "La pantalla aún no está lista.");
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo capturar la pantalla.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
    if (result.length * 0.75 > 512 * 1024)
      throw new Error(
        "La captura supera el tamaño admitido. Reduce la ventana y vuelve a intentar.",
      );
    return result;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
