export interface RevalidateOptions {
  duration?: number;
}

/**
 * Mixin class (Behavior Hook) dùng để đính kèm khả năng 
 * kiểm tra bộ nhớ đệm (cache) dựa trên thời gian.
 */
export function Revalidate(options: RevalidateOptions) {
  return class RevalidateBehavior {
    public readonly revalidate: number = options.duration || 0;
    
    /**
     * Dùng để kiểm tra xem đã đến lúc phải fetch lại dữ liệu hay chưa
     * @param lastFetched Timestamp của lần gọi thành công cuối cùng
     */
    shouldRevalidate(lastFetched: number): boolean {
      if (this.revalidate === 0) return true; // 0 nghĩa là luôn luôn fetch mới
      return Date.now() - lastFetched > this.revalidate;
    }
  }
}
