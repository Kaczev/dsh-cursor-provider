import { ProviderError } from './provider.js';

/** SDK attaches images to one send; explicit occurrence indexes preserve history order. */
export async function imagePrompt(options, { attachments, offloadedImageText }) {
  const images = [], messages = [], stored = new Map();
  for (const message of options.messages) {
    const content = [];
    for (const block of message.content) {
      if (options.signal?.aborted) throw new ProviderError('ABORTED', 'Request cancelled');
      if (block.type !== 'image') { content.push(block); continue; }
      if (block.offloaded) {
        content.push({ type: 'text', text: offloadedImageText(block.attachment) });
        continue;
      }
      const ref = block.attachment;
      if (!attachments) throw new ProviderError('IMAGE_STORE_UNAVAILABLE', 'DSH attachment service is required to send images');
      let image = stored.get(ref.attachmentId);
      if (!image) {
        try { image = await attachments.readImage(ref, options.signal); }
        catch { throw new ProviderError(options.signal?.aborted ? 'ABORTED' : 'IMAGE_READ_FAILED', 'Could not read and verify the DSH image attachment'); }
        stored.set(ref.attachmentId, image);
      }
      if (options.signal?.aborted) throw new ProviderError('ABORTED', 'Request cancelled');
      images.push({ data: Buffer.from(image.data).toString('base64'), mimeType: ref.mediaType, dimension: { width: ref.width, height: ref.height } });
      content.push({ type: 'image', attachment: ref, sdkImage: images.length });
    }
    messages.push({ ...message, content });
  }
  return { messages, images };
}
