import { requestData, route } from '../client';
import { type Meta, metaSchema } from '../schemas/meta';

export async function getMeta(signal?: AbortSignal): Promise<Meta> {
  return requestData(route('/v1/meta'), {
    schema: metaSchema,
    ...(signal ? { signal } : {}),
  });
}
