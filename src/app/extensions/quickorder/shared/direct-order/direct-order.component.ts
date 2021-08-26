import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';

import { CheckoutFacade } from 'ish-core/facades/checkout.facade';
import { ProductContextFacade } from 'ish-core/facades/product-context.facade';
import { GenerateLazyComponent } from 'ish-core/utils/module-loader/generate-lazy-component.decorator';

@Component({
  selector: 'ish-direct-order',
  templateUrl: './direct-order.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ProductContextFacade],
})
@GenerateLazyComponent()
export class DirectOrderComponent implements OnInit, OnDestroy, AfterViewInit {
  directOrderForm = new FormGroup({});
  fields: FormlyFieldConfig[];
  model = { sku: '' };

  hasQuantityError$: Observable<boolean>;
  loading$: Observable<boolean>;

  private destroy$ = new Subject();

  constructor(
    private checkoutFacade: CheckoutFacade,
    private translate: TranslateService,
    private context: ProductContextFacade
  ) {}

  ngOnInit() {
    this.fields = this.getFields();
    this.hasQuantityError$ = this.context.select('hasQuantityError');
    this.context.set('quantity', () => 1);
    this.context.config = { quantity: true };
  }

  ngAfterViewInit() {
    this.context.connect(
      'sku',
      this.directOrderForm.get('sku').valueChanges.pipe(
        tap(() => this.context.set('loading', () => true)),
        debounceTime(500)
      )
    );
    this.context
      .select('product')
      .pipe(takeUntil(this.destroy$))
      .subscribe(product => {
        const formControl = this.directOrderForm.get('sku');
        formControl.setErrors(product.failed && formControl.value.trim !== '' ? { validProduct: false } : undefined);
      });

    this.context.connect('maxQuantity', this.checkoutFacade.basketMaxItemQuantity$);
    this.loading$ = this.context.select('loading');
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit() {
    this.context.addToBasket();
    this.directOrderForm.reset();
    this.context.set('quantity', () => 1);
  }

  private getFields(): FormlyFieldConfig[] {
    return [
      {
        key: 'sku',
        type: 'ish-text-input-field',
        templateOptions: {
          fieldClass: 'col-12',
          placeholder: 'shopping_cart.direct_order.item_placeholder',
          attributes: { autocomplete: 'on' },
        },
        validation: {
          messages: {
            validProduct: () => this.translate.get('quickorder.page.error.invalid.product', { 0: this.model.sku }),
          },
        },
      },
    ];
  }
}
