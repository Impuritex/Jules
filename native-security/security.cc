#include <napi.h>
#include <vector>
#include <chrono>
#include <openssl/evp.h>

std::vector<long long> numLockTimestamps;

// Checks the rhythm of NumLock presses (in milliseconds)
// Logic: If there are 3 presses, the intervals between press 1-2 and 2-3 should be around 3000ms (2500ms - 3500ms).
Napi::Value CheckNumLockRhythm(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();

    if (numLockTimestamps.empty()) {
        numLockTimestamps.push_back(now);
        return Napi::Boolean::New(env, false);
    }

    long long last = numLockTimestamps.back();
    long long diff = now - last;

    if (diff >= 2500 && diff <= 3500) {
        numLockTimestamps.push_back(now);
        if (numLockTimestamps.size() >= 3) {
            numLockTimestamps.clear();
            return Napi::Boolean::New(env, true); // Rhythm matches
        }
    } else {
        numLockTimestamps.clear();
        numLockTimestamps.push_back(now);
    }

    return Napi::Boolean::New(env, false);
}

Napi::Value ResetNumLockTimestamps(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    numLockTimestamps.clear();
    return env.Undefined();
}

// Custom Key Derivation in Native Module
// DeriveKey(password, salt) -> Buffer
Napi::Value NativeDeriveKey(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "String password and Buffer salt expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string password = info[0].As<Napi::String>().Utf8Value();
    Napi::Buffer<uint8_t> saltBuffer = info[1].As<Napi::Buffer<uint8_t>>();

    if (password.length() > 128) {
        Napi::Error::New(env, "Password exceeds maximum length of 128 characters").ThrowAsJavaScriptException();
        return env.Null();
    }

    const int PBKDF2_ITERATIONS = 100000;
    const int KEY_LENGTH = 32;

    uint8_t outKey[KEY_LENGTH];

    if (!PKCS5_PBKDF2_HMAC(password.c_str(), password.length(),
                           saltBuffer.Data(), saltBuffer.Length(),
                           PBKDF2_ITERATIONS,
                           EVP_sha512(),
                           KEY_LENGTH, outKey)) {
        Napi::Error::New(env, "Key derivation failed").ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::Buffer<uint8_t>::Copy(env, outKey, KEY_LENGTH);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "checkNumLockRhythm"), Napi::Function::New(env, CheckNumLockRhythm));
    exports.Set(Napi::String::New(env, "resetNumLockTimestamps"), Napi::Function::New(env, ResetNumLockTimestamps));
    exports.Set(Napi::String::New(env, "deriveKey"), Napi::Function::New(env, NativeDeriveKey));
    return exports;
}

NODE_API_MODULE(security, Init)