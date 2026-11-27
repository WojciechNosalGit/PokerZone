'use strict';

const pokerAvatars = (() => {
  const groups = [
    ['neon', 'Neonowe', [
      'male', 'female', 'male', 'female',
      'neutral', 'female', 'male', 'male',
      'female', 'male', 'female', 'female'
    ]],
    ['rick', 'Komiksowe', [
      'male', 'female', 'male', 'female',
      'male', 'male', 'female', 'neutral',
      'neutral', 'male', 'female', 'male'
    ]],
    ['mafia', 'Mafia', [
      'male', 'male', 'female', 'male',
      'female', 'male', 'male', 'female',
      'female', 'male', 'male', 'male'
    ]],
    ['animal', 'Zwierzęta', [
      'male', 'male', 'female', 'male',
      'male', 'male', 'neutral', 'neutral',
      'male', 'neutral', 'male', 'neutral'
    ]],
    ['cyberpunk', 'Cyberpunk', [
      'male', 'male', 'neutral', 'female',
      'female', 'neutral', 'male', 'male',
      'female', 'female', 'neutral', 'male'
    ]],
    ['fantasy', 'Fantasy', [
      'male', 'female', 'male', 'female',
      'male', 'male', 'female', 'neutral',
      'female', 'male', 'neutral', 'female'
    ]],
    ['adventure', 'Przygodowe', [
      'female', 'male', 'female', 'male',
      'male', 'female', 'male', 'female',
      'male', 'male', 'female', 'male'
    ]]
  ].map(([groupId, label, genders]) => ({
    id: groupId,
    label,
    presets: genders.map((gender, index) => ({ id: `${groupId}-${index + 1}`, gender }))
  }));
  const botPresets = groups.flatMap(group => group.presets);
  const botPresetIds = new Set(botPresets.map(({ id }) => id));
  const legacySilhouettes = ['neutral', 'teal', 'blue', 'green', 'gold', 'pink', 'purple'];
  const presetIds = new Set([...botPresetIds, ...legacySilhouettes.map(color => `default-${color}`)]);
  const isPreset = value => presetIds.has(value);
  const isUpload = value => typeof value === 'string' && /^data:image\/(?:png|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value);

  function setPreset(element, value) {
    if (isPreset(value)) element.dataset.avatarPreset = value;
    else delete element.dataset.avatarPreset;
  }

  function setAvatar(element, value) {
    setPreset(element, value);
    const uploaded = isUpload(value);
    element.classList.toggle('custom-avatar', uploaded);
    if (uploaded) element.style.setProperty('--profile-avatar', `url("${value}")`);
    else element.style.removeProperty('--profile-avatar');
    if (element.classList.contains('avatar-portrait')) {
      if (botPresetIds.has(value)) {
        const portrait = new URL(`assets/images/portraits/${value}.webp`, document.baseURI);
        element.style.setProperty('--avatar-portrait-image', `url("${portrait.href}")`);
      } else {
        element.style.removeProperty('--avatar-portrait-image');
      }
    }
  }

  function fillBotAvatars(players, excluded = []) {
    const missing = players.slice(1).filter(player => player.kind !== 'human' && !botPresetIds.has(player.avatar));
    if (!missing.length) return;

    const used = new Set([...excluded, ...players.map(player => player.avatar)]);
    const available = pokerCards.shuffled(botPresets.filter(({ id }) => !used.has(id)));
    for (const bot of missing) {
      const matching = available.findIndex(({ gender }) => gender === bot.avatarGender);
      const [avatar] = available.splice(Math.max(0, matching), 1);
      bot.avatar = avatar.id;
    }
  }

  return { groups, isPreset, isUpload, setPreset, setAvatar, fillBotAvatars };
})();
