import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

(window as unknown as { global: Window }).global = window;

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
