
import * as cryptutils from '../src/crypto.js'
import * as t from 'lib0/testing.js'
import * as prng from 'lib0/prng.js'

/**
 * @param {t.TestCase} tc
 */
export const testReapeatEncryption = async tc => {
  const secret = prng.word(tc.prng)
  const roomName = prng.word(tc.prng)
  const data = prng.uint8Array(tc.prng, 100)

  /**
   * @type {any}
   */
  let encrypted, decrypted, key
  await t.measureTime('Key generation', async () => {
    key = await cryptutils.deriveKey(secret, roomName)
  })
  await t.measureTime('Encryption', async () => {
    encrypted = await cryptutils.encrypt(data, key)
  })
  t.info(`Byte length: ${data.byteLength}b`)
  t.info(`Encrypted length: ${encrypted.length}b`)
  await t.measureTime('Decryption', async () => {
    decrypted = await cryptutils.decrypt(encrypted, key)
  })
  t.compare(data, decrypted)
}
