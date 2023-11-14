export type Grade = 'again' | 'hard' | 'good' | 'easy';

export type DeckId = number | 'blacklist' | 'never-forget' | 'forq';

export type Ruby = {
    text: string | null;
    start: number;
    end: number;
    length: number;
};

export type Token = {
    start: number;
    end: number;
    length: number;
    card: Card;
    rubies: Ruby[];
};

//TODO Asayake simplify this to one string/enum?
export type CardState = string[] &
    (
        | ['new' | 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended' | 'blacklisted']
        | ['redundant', 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended']
        | ['locked', 'new' | 'due' | 'failed']
        | ['redundant', 'locked'] // Weird outlier, might either be due or failed
        | ['not-in-deck']
    );

export type Card = {
    id: number;
    state: CardState;
    spelling: string;
};
