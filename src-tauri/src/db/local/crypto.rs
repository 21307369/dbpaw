use super::LocalDb;
use crate::error::AppError;
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;

impl LocalDb {
    pub fn encrypt_ai_api_key(&self, plaintext: &str) -> Result<String, AppError> {
        Self::encrypt_ai_api_key_raw(&self.ai_master_key, plaintext)
    }

    pub fn decrypt_ai_api_key(&self, encrypted: &str) -> Result<String, AppError> {
        Self::decrypt_ai_api_key_raw(&self.ai_master_key, encrypted)
    }

    pub fn has_encrypted_ai_api_key(value: &str) -> bool {
        let trimmed = value.trim();
        trimmed.starts_with(Self::AI_KEY_PREFIX) && trimmed.len() > Self::AI_KEY_PREFIX.len()
    }

    pub(super) fn encrypt_ai_api_key_raw(
        master_key: &[u8; 32],
        plaintext: &str,
    ) -> Result<String, AppError> {
        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|e| AppError::internal(format!("[AI_KEY_CIPHER] {e}")))?;
        let mut nonce_bytes = [0u8; 12];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| AppError::internal(format!("[AI_KEY_ENCRYPT] {e}")))?;

        let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        payload.extend_from_slice(&nonce_bytes);
        payload.extend_from_slice(&ciphertext);
        let encoded = general_purpose::STANDARD.encode(payload);
        Ok(format!("{}{}", LocalDb::AI_KEY_PREFIX, encoded))
    }

    pub(super) fn decrypt_ai_api_key_raw(
        master_key: &[u8; 32],
        encrypted: &str,
    ) -> Result<String, AppError> {
        let trimmed = encrypted.trim();
        if !trimmed.starts_with(LocalDb::AI_KEY_PREFIX) {
            return Err(AppError::internal("Missing encryption prefix"));
        }
        let b64 = &trimmed[LocalDb::AI_KEY_PREFIX.len()..];
        let payload = general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| AppError::internal(format!("[AI_KEY_BASE64] {e}")))?;
        if payload.len() < 13 {
            return Err(AppError::internal("Payload too short"));
        }
        let (nonce_bytes, ciphertext) = payload.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(master_key)
            .map_err(|e| AppError::internal(format!("[AI_KEY_CIPHER] {e}")))?;
        let nonce = Nonce::from_slice(nonce_bytes);
        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::internal(format!("AI key decryption failed: {}", e)))?;
        String::from_utf8(plaintext)
            .map_err(|e| AppError::internal_with("AI key UTF-8 conversion failed", e))
    }
}
