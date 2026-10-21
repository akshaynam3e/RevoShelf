import { createApp } from './app';
import { env } from './env';

createApp().listen(env.PORT, () => console.log(`RevoShelf API listening on :${env.PORT} (${env.NODE_ENV})`));
