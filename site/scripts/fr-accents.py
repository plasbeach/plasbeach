#!/usr/bin/env python3
"""Builds site/public/about/fr-accents.txt: French words whose accents the About editor adds while typing.

Source: Debian's French word list (package wfrench, /usr/share/dict/french). Without root:
    apt download wfrench && dpkg-deb -x wfrench_*.deb wfrench
    python3 site/scripts/fr-accents.py wfrench/usr/share/dict/french

A word is listed only when typing it without accents can't mean anything else:
  - its unaccented spelling isn't a word itself (a/à, ou/où, sur/sûr, cote/côte stay as typed);
  - if several accented words share that spelling (écoute/écouté), only the accents they all share
    are added, and only when that gives one of them (écoute); otherwise nothing (élève/élevé).
EXTRA adds frequent words the rules above leave out.
"""
import collections
import sys
import unicodedata
from pathlib import Path

EXTRA = ['après', 'même', 'ça', 'près', 'tête', 'fête', 'forêt', 'déjà', 'voilà', 'cœur', 'œuvre', 'sœur', 'œil', 'là-bas', 'peut-être']
OUT = Path(__file__).resolve().parent.parent / 'public/about/fr-accents.txt'


def strip(w: str) -> str:
    w = w.replace('œ', 'oe').replace('æ', 'ae')
    return ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')


def main(src: str) -> None:
    words = [w.strip() for w in open(src, encoding='utf-8') if w.strip()]
    plain = {w.lower() for w in words if strip(w) == w}
    by = collections.defaultdict(set)
    for w in words:
        if w == w.lower() and ' ' not in w and strip(w) != w:
            by[strip(w)].add(w)
    keep = {}
    for key, forms in by.items():
        if key in plain:
            continue
        if len(forms) == 1:
            keep[key] = next(iter(forms))
            continue
        # Only the accents every form agrees on (same length as the key: no œ/æ here)
        fs = [f for f in forms if len(f) == len(key)]
        if len(fs) != len(forms):
            continue
        common = ''.join(cs[0] if len(set(cs)) == 1 else k for k, cs in zip(key, zip(*fs)))
        if common in forms:
            keep[key] = common
    for w in EXTRA:
        keep[strip(w)] = w
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(sorted(keep.values())) + '\n', encoding='utf-8')
    print(len(keep), 'words ->', OUT)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/usr/share/dict/french')
