const supabase = require('../config/supabase');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const BUCKETS = {
  avatars: 'avatars',
  messages: 'messages',
  status: 'status',
  groups: 'groups'
};

async function ensureBuckets() {
  for (const bucket of Object.values(BUCKETS)) {
    const { data } = await supabase.storage.getBucket(bucket);
    if (!data) {
      await supabase.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 52428800
      });
    }
  }
}

async function compressImage(buffer) {
  try {
    return await sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

async function uploadFile(file, bucket, folder = '') {
  let buffer = file.buffer;
  let contentType = file.mimetype;
  let ext = path.extname(file.originalname) || '';

  if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/gif') {
    buffer = await compressImage(buffer);
    contentType = 'image/jpeg';
    ext = '.jpg';
  }

  const fileName = `${folder}${uuidv4()}${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, buffer, {
      contentType,
      upsert: false
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
    name: file.originalname,
    size: buffer.length,
    mime: contentType
  };
}

async function deleteFile(bucket, filePath) {
  await supabase.storage.from(bucket).remove([filePath]);
}

module.exports = {
  BUCKETS,
  ensureBuckets,
  uploadFile,
  deleteFile
};
