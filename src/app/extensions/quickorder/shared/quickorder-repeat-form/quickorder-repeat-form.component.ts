import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { FieldArrayType, FormlyFieldConfig } from '@ngx-formly/core';
import { Subject } from 'rxjs';

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

  ngAfterViewInit() {
    this.updateContexts();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addMultipleRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.add(this.model.length, { sku: '', quantity: undefined });
    }
    this.updateContexts();
  }

  updateContexts() {
    this.contexts.forEach((context: { context: ProductContextFacade }, index) => {
      this.addContextToTemplateOptions(context.context, this.field.fieldGroup[index].fieldGroup[0]);
    });
  }

  private addContextToTemplateOptions(context: ProductContextFacade, field: FormlyFieldConfig) {
    field.templateOptions.context = context;
  }
}
