"""Import parsed WhatsApp music shares using verified, cached public track metadata.

Inputs stay outside the repository. Existing IDs and array positions never change.
"""
import argparse
import collections
import copy
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


def name_key(value):
    return re.sub(r'\s+', ' ', re.sub(r'^~[\s\u202f]+', '', value, count=1).strip()).casefold()


def display_name(value):
    return re.sub(r'^~[\s\u202f]+', '', value, count=1).strip()


def track_id(url):
    p = urlparse(url)
    path = unquote(p.path)
    query = parse_qs(p.query)
    if p.hostname == 'open.spotify.com':
        match = re.search(r'/track/([A-Za-z0-9]{22})(?:/|$)', path)
        return 'spotify:' + match[1] if match else None
    if p.hostname == 'youtu.be':
        video = path.strip('/').split('/')[0]
        return 'youtube:' + video if re.fullmatch(r'[\w-]{11}', video) else None
    if p.hostname in ('youtube.com', 'www.youtube.com', 'music.youtube.com'):
        video = query.get('v', [''])[0]
        return 'youtube:' + video if re.fullmatch(r'[\w-]{11}', video) else None
    if p.hostname == 'music.apple.com':
        song = query.get('i', [''])[0]
        if not song and '/song/' in path:
            song = path.rstrip('/').split('/')[-1]
        return 'apple:' + song if song.isdigit() else None


def text_key(value):
    value = unicodedata.normalize('NFKC', value).casefold()
    return ''.join(c for c in value if c.isalnum())


def metadata_key(song):
    return text_key(song['title']), text_key(song.get('artist', ''))


def fingerprint(ids):
    return hashlib.sha256('\n'.join(ids).encode()).hexdigest()


def import_catalog(catalog, messages, metadata):
    result = copy.deepcopy(catalog)
    people = {p['id']: p for p in result['people']}
    songs = {s['id']: s for s in result['songs']}
    original_urls = {share['url']: s['id'] for s in catalog['songs'] for share in s['shares']}
    anchors = collections.defaultdict(set)
    for s in catalog['songs']:
        for share in s['shares']:
            anchors[s['id'], share['date']].add(share['person'])

    aliases = {}
    events = []
    skipped = []
    for message in messages:
        for url in message['urls']:
            if not re.search(r'spotify|youtu|music\.apple', url, re.I):
                continue
            sid = original_urls.get(url) or track_id(url)
            # Resolved short links can be supplied by the metadata cache.
            sid = metadata.get(url, {}).get('id') or sid
            key = name_key(message['sender'])
            alias = aliases.setdefault(key, {'anchors': set(), 'events': []})
            event = dict(message, url=url, sid=sid, key=key)
            alias['events'].append(event)
            events.append(event)
            candidates = anchors.get((sid, message['date']), set())
            if len(candidates) == 1:
                alias['anchors'].update(candidates)

    accepted = []
    next_person = max(int(p['id'][1:]) for p in result['people'] if re.fullmatch(r'p\d+', p['id'])) + 1
    latest = {}
    for event in events:
        sid = event['sid']
        item = songs.get(sid) or metadata.get(sid, {})
        if not sid or not item.get('title'):
            skipped.append({'reason': 'unidentified_track', 'sender': event['sender'], 'date': event['date'], 'url': event['url']})
            continue
        alias = aliases[event['key']]
        if len(alias['anchors']) == 1:
            person = next(iter(alias['anchors']))
        elif len(alias['anchors']) > 1:
            candidates = anchors.get((sid, event['date']), set()) & alias['anchors']
            if len(candidates) != 1:
                skipped.append({'reason': 'ambiguous_sender', 'sender': event['sender'], 'date': event['date'], 'url': event['url'], 'title': item['title']})
                continue
            person = next(iter(candidates))
        else:
            if 'person' not in alias:
                person = 'p' + str(next_person)
                next_person += 1
                alias['person'] = person
                p = {'id': person, 'name': display_name(event['sender'])}
                result['people'].append(p)
                people[person] = p
            person = alias['person']
        accepted.append((event, person))
        timestamp = event['date'] + 'T' + event['time'].zfill(8)
        if timestamp >= latest.get(person, ('', ''))[0]:
            latest[person] = timestamp, display_name(event['sender'])

    for person, (_, name) in latest.items():
        people[person]['name'] = name
        people[person].pop('active', None)
    # Explicit owner-approved distinction for the shared WhatsApp label.
    people['p58']['name'] = 'רוני השחורה'
    people['p59']['name'] = 'רוני הלבנה'

    keys = collections.defaultdict(set)
    for song in result['songs']:
        keys[metadata_key(song)].add(song['id'])
    remapped = {}
    shares = {(s['id'], x['person'], x['date']) for s in result['songs'] for x in s['shares']}
    new_shares = 0
    spotify_links = 0
    for event, person in accepted:
        sid = event['sid']
        if sid in remapped:
            sid = remapped[sid]
        if sid not in songs:
            item = metadata[event['sid']]
            candidates = keys.get(metadata_key(item), set())
            if len(candidates) == 1 and metadata_key(item)[1]:
                sid = next(iter(candidates))
                remapped[event['sid']] = sid
            else:
                song = {'id': sid, **{k: item.get(k, '') for k in ('title', 'artist', 'image', 'url')}, 'shares': [], 'month': event['date'][:7]}
                songs[sid] = song
                result['songs'].append(song)
                keys[metadata_key(song)].add(sid)
                if not sid.startswith('spotify:') and song['url'].startswith('https://open.spotify.com/track/'):
                    song['spotifyUrl'] = song['url'].split('?')[0]
                    spotify_links += 1
        song = songs[sid]
        if event['sid'].startswith('spotify:') and not song['url'].startswith('https://open.spotify.com/track/'):
            song['spotifyUrl'] = 'https://open.spotify.com/track/' + event['sid'].split(':', 1)[1]
            song['url'] = song['spotifyUrl']
            spotify_links += 1
        share_key = sid, person, event['date']
        if share_key not in shares:
            song['shares'].append({'person': person, 'date': event['date'], 'url': event['url']})
            shares.add(share_key)
            new_shares += 1
        song['month'] = min(x['date'][:7] for x in song['shares'])

    # Add already verified Spotify equivalents to non-Spotify songs, without search guesses.
    spotify_by_key = collections.defaultdict(set)
    for song in result['songs']:
        if song['url'].startswith('https://open.spotify.com/track/'):
            spotify_by_key[metadata_key(song)].add(song['url'].split('?')[0])
    for song in result['songs']:
        candidates = spotify_by_key.get(metadata_key(song), set())
        if not song['url'].startswith('https://open.spotify.com/track/') and len(candidates) == 1 and metadata_key(song)[1]:
            song['url'] = song['spotifyUrl'] = next(iter(candidates))
            spotify_links += 1

    original_song_ids = [s['id'] for s in catalog['songs']]
    original_person_ids = [p['id'] for p in catalog['people']]
    assert [s['id'] for s in result['songs'][:len(original_song_ids)]] == original_song_ids
    assert [p['id'] for p in result['people'][:len(original_person_ids)]] == original_person_ids
    assert len({s['id'] for s in result['songs']}) == len(result['songs'])
    for song in result['songs']:
        assert song['title'] and song['url'] and song['shares']
        assert all(x['person'] in people for x in song['shares'])
    report = {'old_songs': len(catalog['songs']), 'songs': len(result['songs']), 'added_songs': len(result['songs']) - len(catalog['songs']), 'people': len(result['people']), 'added_people': len(result['people']) - len(catalog['people']), 'added_shares': new_shares, 'spotify_links_added': spotify_links, 'duplicates_merged': len(remapped), 'preserved_song_order_sha256': fingerprint(original_song_ids), 'preserved_person_order_sha256': fingerprint(original_person_ids), 'renamed_people': [{'id': p['id'], 'before': p['name'], 'after': people[p['id']]['name']} for p in catalog['people'] if p['name'] != people[p['id']]['name']], 'skipped_counts': dict(collections.Counter(x['reason'] for x in skipped)), 'skipped': skipped}
    return result, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('catalog', 'messages', 'metadata', 'output', 'report'):
        parser.add_argument('--' + arg, required=True, type=Path)
    args = parser.parse_args()
    result, report = import_catalog(*(json.loads(p.read_text()) for p in (args.catalog, args.messages, args.metadata)))
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k not in ('skipped', 'renamed_people')}, ensure_ascii=False))
