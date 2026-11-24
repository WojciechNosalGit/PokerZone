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
    ]]
  ].map(([groupId, label, genders]) => ({
    id: groupId,
    label,
    presets: genders.map((gender, index) => ({ id: `${groupId}-${index + 1}`, gender }))
  }));
  const presets = groups.flatMap(group => group.presets);
  const presetIds = new Set(presets.map(({ id }) => id));
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
  }

  function fillBotAvatars(players, excluded = []) {
    const missing = players.slice(1).filter(player => player.kind !== 'human' && !isPreset(player.avatar));
    if (!missing.length) return;

    const used = new Set([...excluded, ...players.map(player => player.avatar)]);
    const available = pokerCards.shuffled(presets.filter(({ id }) => !used.has(id)));
    for (const bot of missing) {
      const matching = available.findIndex(({ gender }) => gender === bot.avatarGender);
      const [avatar] = available.splice(Math.max(0, matching), 1);
      bot.avatar = avatar.id;
    }
  }

  return { groups, isPreset, isUpload, setPreset, setAvatar, fillBotAvatars };
})();
