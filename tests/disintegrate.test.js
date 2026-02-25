const test = require('node:test');
const assert = require('node:assert');

// Simulate the disintegration logic
function checkDisintegration(notes, currentTime) {
    return notes.filter(note => {
        if (note.security && note.security.validityDuration && note.security.lastRefreshedAt) {
            const expiry = note.security.lastRefreshedAt + (note.security.validityDuration * 60 * 60 * 1000);
            if (currentTime > expiry) {
                return false; // Wipe
            }
        }
        return true;
    });
}

test('Dead Mans Switch: Expired note is removed', () => {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);

    const notes = [
        {
            id: '1',
            security: {
                validityDuration: 1, // 1 hour validity
                lastRefreshedAt: twoHoursAgo // Last refreshed 2 hours ago -> EXPIRED
            }
        },
        {
            id: '2',
            security: {
                validityDuration: 5, // 5 hours validity
                lastRefreshedAt: oneHourAgo // Last refreshed 1 hour ago -> VALID
            }
        },
        {
            id: '3',
            security: {} // No validity set -> VALID
        }
    ];

    const remainingNotes = checkDisintegration(notes, now);

    assert.strictEqual(remainingNotes.length, 2);
    assert.ok(remainingNotes.find(n => n.id === '2'));
    assert.ok(remainingNotes.find(n => n.id === '3'));
    assert.strictEqual(remainingNotes.find(n => n.id === '1'), undefined);
});

test('Dead Mans Switch: Refresh extends validity', () => {
    const now = Date.now();
    const almostExpiredTime = now - (59 * 60 * 1000); // 59 mins ago

    let note = {
        id: '1',
        security: {
            validityDuration: 1, // 1 hour
            lastRefreshedAt: almostExpiredTime
        }
    };

    // Check just before expiry
    let remaining = checkDisintegration([note], now);
    assert.strictEqual(remaining.length, 1);

    // Simulate refresh
    note.security.lastRefreshedAt = now;

    // Check in future (e.g. 30 mins later)
    const future = now + (30 * 60 * 1000);
    remaining = checkDisintegration([note], future);
    assert.strictEqual(remaining.length, 1);
});
