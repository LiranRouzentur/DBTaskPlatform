import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('renders the brand name in the top bar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const brandText = (fixture.nativeElement as HTMLElement).querySelector('.brand-name')?.textContent ?? '';
    expect(brandText).toContain('TaskPlatform');
  });
});
