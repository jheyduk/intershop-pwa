import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { FormlyFieldConfig, FormlyFormOptions } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { EMPTY, Subject } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

import { ProductContextFacade } from 'ish-core/facades/product-context.facade';
import { ShoppingFacade } from 'ish-core/facades/shopping.facade';
import { SkuQuantityType } from 'ish-core/models/product/product.helper';
import { whenTruthy } from 'ish-core/utils/operators';

@Component({
  selector: 'ish-quickorder-add-products-form',
  templateUrl: './quickorder-add-products-form.component.html',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class QuickorderAddProductsFormComponent implements OnInit, OnDestroy {
  quickOrderForm: FormGroup = new FormGroup({});
  model: { addProducts: SkuQuantityType[] } = { addProducts: [] };
  options: FormlyFormOptions = {};
  fields: FormlyFieldConfig[];

  private destroy$ = new Subject();

  numberOfRows = 5;

  constructor(private translate: TranslateService, private shoppingFacade: ShoppingFacade) {}

  ngOnInit() {
    this.initModel();
    this.fields = this.getFields();
  }

  reset() {
    this.options.resetModel();
    this.initModel();
  }

  onAddProducts() {
    const products = this.model.addProducts.filter((p: SkuQuantityType) => !!p.sku && !!p.quantity);
    if (products.length > 0) {
      products.forEach(product => {
        this.shoppingFacade.addProductToBasket(product.sku, product.quantity);
      });
    }
    this.reset();
  }

  private initModel() {
    this.model = { addProducts: [] };
    for (let i = 0; i < this.numberOfRows; i++) {
      this.model.addProducts.push({ sku: '', quantity: 1 });
    }
  }

  /**
   * returns the field with a repeating type
   * repeat contains the representing of the form with form fields and links to add and remove lines
   * the field array give the input field with validators of the sku for each line (which are represented by the objects of the model array)
   */
  private getFields(): FormlyFieldConfig[] {
    return [
      {
        key: 'addProducts',
        type: 'repeat',
        templateOptions: {
          addText: 'quickorder.page.add.row',
          addMoreText: 'quickorder.page.add.row.multiple',
          numberMoreRows: this.numberOfRows,
        },
        fieldArray: {
          fieldGroupClassName: 'row list-item-row py-2',
          fieldGroup: [
            {
              key: 'sku',
              type: 'ish-text-input-field',
              className: 'col-12 list-item search-container',
              modelOptions: {
                debounce: { default: 500 },
              },
              templateOptions: {
                fieldClass: 'col-12',
                placeholder: 'shopping_cart.direct_order.item_placeholder',
              },
              asyncValidators: {
                validProduct: {
                  expression: (control: FormControl, config: FormlyFieldConfig) => {
                    const context: ProductContextFacade = config.templateOptions.context;
                    if (context) {
                      return context.select('product').pipe(
                        whenTruthy(),
                        tap(product => {
                          control.setErrors(
                            product.failed && control.value.trim !== '' ? { validProduct: false } : undefined
                          );
                        }),
                        takeUntil(this.destroy$)
                      );
                    } else {
                      return EMPTY;
                    }
                  },
                  message: (_: unknown, field: FormlyFieldConfig) =>
                    this.translate.get('quickorder.page.error.invalid.product', {
                      0: this.model.addProducts[parseInt(field.parent.key.toString(), 10)].sku,
                    }),
                },
              },
              expressionProperties: {
                'templateOptions.required': (control: SkuQuantityType) => !!control.quantity,
              },
              validation: {
                messages: {
                  required: 'quickorder.page.quantityWithoutSKU',
                },
              },
            },
          ],
        },
      },
    ];
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
