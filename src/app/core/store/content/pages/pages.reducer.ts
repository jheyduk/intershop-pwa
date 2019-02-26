import { EntityState, createEntityAdapter } from '@ngrx/entity';

import { ContentPage } from 'ish-core/models/content-page/content-page.model';

import { PageAction, PagesActionTypes } from './pages.actions';

export const pagesAdapter = createEntityAdapter<ContentPage>({
  selectId: contentPage => contentPage.id,
});

export interface PagesState extends EntityState<ContentPage> {
  loading: boolean;
  selected: string;
}

export const initialState: PagesState = pagesAdapter.getInitialState({
  loading: false,
  selected: undefined,
});

export function pagesReducer(state = initialState, action: PageAction): PagesState {
  switch (action.type) {
    case PagesActionTypes.SelectContentPage: {
      return {
        ...state,
        selected: action.payload.contentPageId,
      };
    }

    case PagesActionTypes.LoadContentPage: {
      return {
        ...state,
        loading: true,
      };
    }

    case PagesActionTypes.LoadContentPageFail: {
      return {
        ...state,
        loading: false,
      };
    }

    case PagesActionTypes.LoadContentPageSuccess: {
      const { page } = action.payload;

      return {
        ...pagesAdapter.upsertOne(page, state),
        loading: false,
      };
    }
  }

  return state;
}
