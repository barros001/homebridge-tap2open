export type Config = {
  username: string;
  password: string;
};

type Token = {
  role: string;
  login_token: string;
  supervisor: boolean;
  cookie: string;
  expires_at: number;
};

type Gate = {
  is_connected: boolean;
  gate_id: number;
  non_default: boolean;
  guard_only: boolean;
  radius: number;
  latitude: number;
  longitude: number;
  parameters: {
    description: string;
  };
};

export enum Event {
  ERROR = 'error'
}

type EventListener = (error?: Tap2OpenError) => void;

type EventListeners = {
  [Event.ERROR]?: Array<EventListener>;
};

type ErrorContext = {
  [key: string]: string | number;
};

export class Tap2OpenError extends Error {
  public context: ErrorContext;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);

    this.name = 'Tap2OpenError';
    this.context = context;
  }
}

export default class Tap2Open {
  TOKEN_TTL = 60 * 60 * 1000; // 1 hour

  private readonly config: Config;
  private token: Token | null = null;
  private listeners: EventListeners = {};

  constructor(config: Config) {
    this.config = config;
  }

  private async login(): Promise<this> {
    if (this.token && this.token.expires_at > Date.now()) {
      return this;
    }

    const response = await fetch('https://tap2open.com/portal/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        chaff: this.generateChaff(),
      }),
    });

    if (!response.ok) {
      this.error('Login failed', response);
    }

    this.token = {
      ...await response.json(),
      cookie: this.extractSessionCookie(response),
      expires_at: Date.now() + this.TOKEN_TTL,
    };

    return this;
  }

  public logout(): this {
    this.token = null;

    return this;
  }

  public async listGates(): Promise<Array<Gate>> {
    await this.login();

    const response = await fetch(`https://tap2open.com/portal/gate-info/full/lockout-time?${Date.now()}`, {
      method: 'GET',
      headers: {
        'X-T2O-Login-Token': this.token!.login_token,
        Cookie: `JSESSIONID=${this.token!.cookie}`,
      },
    });

    if (!response.ok) {
      this.error('Failed to list gates', response);
    }

    return (await response.json()).gates;
  }

  public async openGate(gate: Gate): Promise<boolean> {
    await this.login();

    const response = await fetch('https://tap2open.com/portal/open-gate', {
      method: 'POST',
      headers: {
        'X-T2O-Login-Token': this.token!.login_token,
        Cookie: `JSESSIONID=${this.token!.cookie}`,
      },
      body: JSON.stringify({
        gate_id: gate.gate_id,
      }),
    });

    if (!response.ok) {
      this.error('Failed to open gate', response);
    }

    return true;
  }

  private generateChaff(): string {
    let chaff = '';

    for (let i = Math.floor(Math.random() * 16); i--;) {
      chaff += String.fromCharCode(32 + Math.floor(Math.random() * 95));
    }

    return chaff;
  }

  private extractSessionCookie(response: Response): string {
    // extract JSESSIONID from cookie header
    const cookie = response.headers.get('set-cookie')!;
    const match = /JSESSIONID=([^;]+)/.exec(cookie);

    if (!match) {
      throw new Error('Failed to extract JSESSIONID from cookie');
    }

    return match[1];
  }

  public on(event: Event, listener: EventListener): this {
    (this.listeners[event] ||= []).push(listener);

    return this;
  }

  public off(): this {
    this.listeners = {};

    return this;
  }

  private dispatch(event: Event, error?: Tap2OpenError): this {
    if (!this.listeners[event]) {
      return this;
    }

    for (const listener of this.listeners[event]) {
      listener(error);
    }

    return this;
  }

  private error(message: string, response: Response): void {
    const error = new Tap2OpenError(message, {
      status: response.status,
      statusText: response.statusText,
    });

    this.dispatch(Event.ERROR, error);

    throw error;
  }
}
