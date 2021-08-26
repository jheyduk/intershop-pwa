import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FieldArrayType, FormlyFieldConfig } from '@ngx-formly/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';

import { ProductContextDirective } from 'ish-core/directives/product-context.directive';
import { ProductContextFacade } from 'ish-core/facades/product-context.facade';

@Component({
  selector: 'ish-quickorder-repeat-form',
  templateUrl: './quickorder-repeat-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickorderRepeatFormComponent extends FieldArrayType implements AfterViewInit, OnDestroy {
  @ViewChildren(ProductContextDirective) contexts: QueryList<{ context: ProductContextFacade }>;

  private destroy$ = new Subject();
  private contextUpdate$ = new Subject();

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit() {
    this.updateContexts();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.contextUpdate$.next();
    this.contextUpdate$.complete();
  }

  addMultipleRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.add(this.model.length, { sku: '', quantity: 1 });
    }
    this.updateContexts();
  }

  updateContexts() {
    this.cdRef.detectChanges();
    this.contextUpdate$.next();
    this.contexts.forEach((context: { context: ProductContextFacade }, index) => {
      const field = this.field.fieldGroup[index].fieldGroup[0];
      const formControl = field.formControl;
      this.addContextToTemplateOptions(context.context, field);

      context.context.connect('sku', formControl.valueChanges.pipe(debounceTime(500)));
      context.context
        .select('product')
        .pipe(
          tap(product => {
            formControl.setErrors(
              product.failed && formControl.value.trim !== '' ? { validProduct: false } : undefined
            );
            this.cdRef.markForCheck();
          }),
          takeUntil(this.contextUpdate$)
        )
        .subscribe();
    });
  }

  private addContextToTemplateOptions(context: ProductContextFacade, field: FormlyFieldConfig) {
    field.templateOptions = { ...field.templateOptions, context };
  }
}
