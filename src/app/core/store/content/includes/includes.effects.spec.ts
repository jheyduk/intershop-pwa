import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { cold, hot } from 'jest-marbles';
import { Observable, of, throwError } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';

import { ContentInclude } from '../../../models/content-include/content-include.model';
import { HttpError } from '../../../models/http-error/http-error.model';
import { CMSService } from '../../../services/cms/cms.service';

import {
  IncludesActionTypes,
  LoadContentInclude,
  LoadContentIncludeFail,
  LoadContentIncludeSuccess,
} from './includes.actions';
import { IncludesEffects } from './includes.effects';

describe('Includes Effects', () => {
  let actions$: Observable<Action>;
  let effects: IncludesEffects;
  let cmsServiceMock: CMSService;

  beforeEach(() => {
    cmsServiceMock = mock(CMSService);

    TestBed.configureTestingModule({
      providers: [
        IncludesEffects,
        provideMockActions(() => actions$),
        { provide: CMSService, useFactory: () => instance(cmsServiceMock) },
      ],
    });
    effects = TestBed.get(IncludesEffects);
  });

  describe('loadContentInclude$', () => {
    it('should send success action when loading action via service is successful', done => {
      when(cmsServiceMock.getContentInclude('dummy')).thenReturn(
        of({ include: { id: 'dummy' } as ContentInclude, pagelets: [] })
      );

      actions$ = of(new LoadContentInclude({ includeId: 'dummy' }));

      effects.loadContentInclude$.subscribe((action: LoadContentIncludeSuccess) => {
        verify(cmsServiceMock.getContentInclude('dummy')).once();
        expect(action.type).toEqual(IncludesActionTypes.LoadContentIncludeSuccess);
        expect(action.payload.include).toHaveProperty('id', 'dummy');
        done();
      });
    });

    it('should send fail action when loading action via service is unsuccessful', done => {
      when(cmsServiceMock.getContentInclude('dummy')).thenReturn(throwError({ message: 'ERROR' }));

      actions$ = of(new LoadContentInclude({ includeId: 'dummy' }));

      effects.loadContentInclude$.subscribe((action: LoadContentIncludeFail) => {
        verify(cmsServiceMock.getContentInclude('dummy')).once();
        expect(action.type).toEqual(IncludesActionTypes.LoadContentIncludeFail);
        expect(action.payload.error).toHaveProperty('message', 'ERROR');
        done();
      });
    });

    it('should not die when encountering an error', () => {
      when(cmsServiceMock.getContentInclude('dummy')).thenReturn(throwError({ message: 'ERROR' }));

      actions$ = hot('a-a-a-a', { a: new LoadContentInclude({ includeId: 'dummy' }) });

      expect(effects.loadContentInclude$).toBeObservable(
        cold('a-a-a-a', { a: new LoadContentIncludeFail({ error: { message: 'ERROR' } as HttpError }) })
      );
    });
  });
});
